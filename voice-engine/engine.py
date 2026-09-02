import argparse
import base64
import json
import os
import re
import sys
import threading
import time
import traceback
import uuid


EMIT_LOCK = threading.Lock()


def emit(payload):
    with EMIT_LOCK:
        sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def clean_text(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:1200]


def safe_output_path(output_directory):
    filename = "mai-{}-{}.wav".format(int(time.time() * 1000), uuid.uuid4().hex[:10])
    return os.path.join(output_directory, filename)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--instruct-model", required=True)
    parser.add_argument("--sense-model", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    repo_directory = os.path.abspath(args.repo)
    model_directory = os.path.abspath(args.model)
    instruct_model_directory = os.path.abspath(args.instruct_model)
    sense_model_directory = os.path.abspath(args.sense_model)
    output_directory = os.path.abspath(args.output_dir)
    os.makedirs(output_directory, exist_ok=True)
    sys.path.insert(0, repo_directory)
    sys.path.insert(0, os.path.join(repo_directory, "third_party", "Matcha-TTS"))

    import torch
    import torchaudio
    from cosyvoice.cli.cosyvoice import AutoModel

    cuda_available = bool(torch.cuda.is_available())
    device_name = torch.cuda.get_device_name(0) if cuda_available else "CPU"
    expressive = os.path.isfile(os.path.join(instruct_model_directory, "cosyvoice.yaml"))
    active_model_directory = instruct_model_directory if expressive else model_directory
    model = AutoModel(model_dir=active_model_directory, load_jit=False, load_trt=False, fp16=False)
    speakers = list(model.list_available_spks())
    if "中文女" not in speakers:
        raise RuntimeError("模型中没有找到“中文女”预置音色。")

    emit({
        "type": "ready",
        "cuda": cuda_available,
        "device": device_name,
        "sampleRate": int(model.sample_rate),
        "speakers": speakers,
        "expressive": expressive,
        "senseVoice": os.path.isfile(os.path.join(sense_model_directory, "model.pt")),
    })

    sense_model = None
    sense_lock = threading.Lock()

    def analyze_audio(request):
        nonlocal sense_model
        if not os.path.isfile(os.path.join(sense_model_directory, "model.pt")):
            raise RuntimeError("SenseVoice 情绪识别模型尚未安装。")
        with sense_lock:
            if sense_model is None:
                from funasr import AutoModel as FunAsrAutoModel
                sense_model = FunAsrAutoModel(
                    model=sense_model_directory,
                    device="cpu",
                    disable_update=True,
                )
        encoded = str(request.get("audioBase64") or "")
        audio = base64.b64decode(encoded, validate=True)
        if not audio or len(audio) > 12_000_000:
            raise ValueError("语气分析音频为空或过长。")
        audio_path = safe_output_path(output_directory)
        try:
            with open(audio_path, "wb") as output_file:
                output_file.write(audio)
            with sense_lock:
                result = sense_model.generate(
                    input=audio_path,
                    cache={},
                    language="auto",
                    use_itn=True,
                    batch_size=1,
                )
        finally:
            try:
                os.remove(audio_path)
            except OSError:
                pass
        raw_text = str(result[0].get("text") if result else "")
        tags = re.findall(r"<\|([^|>]+)\|>", raw_text)
        emotions = {"HAPPY", "SAD", "ANGRY", "NEUTRAL", "FEARFUL", "DISGUSTED", "SURPRISED"}
        languages = {"zh", "en", "yue", "ja", "ko", "nospeech"}
        emotion = next((tag.upper() for tag in tags if tag.upper() in emotions), "NEUTRAL")
        language = next((tag.lower() for tag in tags if tag.lower() in languages), "")
        events = [tag for tag in tags if tag.upper() not in emotions and tag.lower() not in languages]
        transcript = re.sub(r"<\|[^|>]+\|>", "", raw_text).strip()
        return {
            "emotion": emotion,
            "language": language,
            "events": events,
            "text": transcript,
        }

    for raw_line in sys.stdin:
        try:
            request = json.loads(raw_line)
        except Exception:
            continue
        request_type = request.get("type")
        if request_type == "shutdown":
            break
        if request_type == "analyze":
            request_id = str(request.get("id") or "")
            def analyze_in_background(analysis_request, analysis_id):
                try:
                    analysis = analyze_audio(analysis_request)
                    emit({"type": "result", "id": analysis_id, **analysis})
                except Exception as error:
                    emit({
                        "type": "error",
                        "id": analysis_id,
                        "error": str(error) or "本地语气分析失败。",
                    })

            threading.Thread(
                target=analyze_in_background,
                args=(request, request_id),
                daemon=True,
                name="mai-sensevoice",
            ).start()
            continue
        if request_type != "synthesize":
            continue

        request_id = str(request.get("id") or "")
        try:
            text = clean_text(request.get("text"))
            if not text:
                raise ValueError("没有可朗读的文字。")
            speed = max(0.75, min(1.3, float(request.get("speed") or 1.0)))
            speaker = str(request.get("speaker") or "中文女")
            if speaker not in speakers:
                speaker = "中文女"
            started_at = time.perf_counter()
            chunks = []
            instruction = clean_text(request.get("instruction"))
            if expressive and instruction:
                outputs = model.inference_instruct(
                    text,
                    speaker,
                    instruction,
                    stream=False,
                    speed=speed,
                )
            else:
                outputs = model.inference_sft(
                    text,
                    speaker,
                    stream=False,
                    speed=speed,
                )
            for output in outputs:
                chunks.append(output["tts_speech"].detach().cpu())
            if not chunks:
                raise RuntimeError("模型没有生成声音。")
            speech = torch.cat(chunks, dim=1)
            output_path = safe_output_path(output_directory)
            torchaudio.save(output_path, speech, model.sample_rate)
            duration_ms = round((speech.shape[1] / model.sample_rate) * 1000)
            emit({
                "type": "result",
                "id": request_id,
                "path": output_path,
                "durationMs": duration_ms,
                "generationMs": round((time.perf_counter() - started_at) * 1000),
                "device": device_name,
                "expressive": expressive and bool(instruction),
            })
        except Exception as error:
            emit({
                "type": "error",
                "id": request_id,
                "error": str(error) or "本地女声合成失败。",
            })


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit({
            "type": "fatal",
            "error": str(error) or "本地女声加载失败。",
            "detail": traceback.format_exc(limit=8)[-5000:],
        })
        raise
