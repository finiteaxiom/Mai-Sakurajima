# 第三方组件说明

## PDF 资料解析

Mai Sakurajima v4.0.0 使用 Mozilla PDF.js 的 npm 分发包 `pdfjs-dist 5.7.284`，在本机提取用户主动导入 PDF 的文字和页码。PDF.js 使用 Apache License 2.0：

- https://github.com/mozilla/pdf.js
- https://www.npmjs.com/package/pdfjs-dist

## 本地语音

Mai Sakurajima v2.5.0 的可选本地情绪语音功能使用以下第三方项目：

- CosyVoice 源码：FunAudioLLM/CosyVoice，Apache License 2.0。
- CosyVoice-300M-SFT 模型：FunAudioLLM/CosyVoice-300M-SFT，模型卡标注 Apache License 2.0。
- CosyVoice-300M-Instruct 模型：用于情绪、语速与表达指令，遵循其模型卡许可。
- SenseVoiceSmall 模型：用于本地语音、情绪、语言与声音事件分析，遵循其模型卡许可。
- FunASR：SenseVoice 的本地推理工具，MIT License；本版本安装 `funasr==1.3.22`。
- Matcha-TTS：作为 CosyVoice 官方锁定的子模块随源码提供，遵循其仓库内许可证。
- Python 3.10.11：从 Python.org 下载，仅安装到本应用的独立语音目录。
- PyTorch / torchaudio 与其他 Python 包：由各项目自己的许可证约束。

本版本固定的源码版本：

- CosyVoice commit: `074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc`
- Matcha-TTS commit: `dd9105b34bf2be2230f4aa1e4769fb586a3c824e`

程序使用模型提供的通用 `中文女` 预置音色，不包含、也不尝试克隆任何声优的录音或身份。

上游地址：

- https://github.com/FunAudioLLM/CosyVoice
- https://huggingface.co/FunAudioLLM/CosyVoice-300M-SFT
- https://huggingface.co/FunAudioLLM/CosyVoice-300M-Instruct
- https://huggingface.co/FunAudioLLM/SenseVoiceSmall
- https://github.com/modelscope/FunASR
- https://github.com/shivammehta25/Matcha-TTS
- https://www.python.org/downloads/release/python-31011/
