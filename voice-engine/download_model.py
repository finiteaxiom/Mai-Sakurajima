import argparse
import json
import os
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--kind", choices=["cosyvoice", "sensevoice"], required=True)
    args = parser.parse_args()
    output = os.path.abspath(args.output)
    os.makedirs(output, exist_ok=True)

    if args.kind == "cosyvoice":
        required = [
            "campplus.onnx",
            "cosyvoice.yaml",
            "flow.pt",
            "hift.pt",
            "llm.pt",
            "speech_tokenizer_v1.onnx",
            "spk2info.pt",
        ]
    else:
        required = [
            "am.mvn",
            "chn_jpn_yue_eng_ko_spectok.bpe.model",
            "config.yaml",
            "configuration.json",
            "model.pt",
        ]

    from modelscope import snapshot_download

    snapshot_download(
        args.model_id,
        local_dir=output,
        allow_file_pattern=required + (["configuration.json"] if args.kind == "cosyvoice" else []),
    )
    missing = [name for name in required if not os.path.isfile(os.path.join(output, name))]
    if missing:
        raise RuntimeError("模型文件不完整：" + ", ".join(missing))
    if args.kind == "cosyvoice":
        # CosyVoice uses WeText to read dates, times, numbers and symbols naturally.
        # Initializing it during installation keeps later speech synthesis offline.
        from wetext import Normalizer
        normalizer = Normalizer(remove_erhua=False)
        normalizer.normalize("今天是2026年8月4日，时间15点30分。")
    print(json.dumps({"ok": True, "model": output, "modelId": args.model_id}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise
