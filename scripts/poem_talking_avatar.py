"""Poem-to-Talking-Avatar Video Generator.

Takes a still portrait photograph + poem text, generates an expressive neural voice
via Edge-TTS (free Bengali neural) or ElevenLabs, and produces a continuous talking-head video
(up to 180 seconds) via Kling Avatar or HeyGen Avatar IV.
"""

import argparse
import asyncio
import base64
import json
import os
import sys
import time
from pathlib import Path
import requests
from dotenv import load_dotenv

load_dotenv()


def generate_bengali_audio(text: str, voice: str = "bn-BD-PradeepNeural", output_path: str = "temp_recitation.mp3") -> str:
    """Generate expressive Bengali poem recitation audio.
    
    Uses ElevenLabs if ELEVENLABS_API_KEY is available, otherwise uses Edge-TTS (free & high-quality).
    """
    eleven_key = os.getenv("ELEVENLABS_API_KEY")
    if eleven_key:
        print("🎙️ Generating Bengali recitation via ElevenLabs Multilingual v2...")
        url = f"https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM"
        headers = {
            "xi-api-key": eleven_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
        }
        payload = {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {"stability": 0.45, "similarity_boost": 0.85, "style": 0.55}
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=120)
        if resp.status_code == 200:
            with open(output_path, "wb") as f:
                f.write(resp.content)
            print(f"✅ ElevenLabs audio generated: {output_path}")
            return output_path
        else:
            print(f"⚠️ ElevenLabs TTS failed ({resp.status_code}), falling back to Edge-TTS...")

    # Fallback / Default: Edge-TTS
    print(f"🎙️ Generating high-quality Bengali neural voice via Edge-TTS ({voice})...")
    import edge_tts
    
    async def _synth():
        comm = edge_tts.Communicate(text, voice, rate="-4%", pitch="+0Hz")
        await comm.save(output_path)
    
    asyncio.run(_synth())
    print(f"✅ Audio generated successfully: {output_path} ({os.path.getsize(output_path)} bytes)")
    return output_path


def render_with_kling_avatar(image_path: str, audio_path: str, output_path: str, prompt: str = "") -> str:
    """Render avatar talking video using official Kling API."""
    print("🎬 Invoking official Kling Avatar tool...")
    from tools.avatar.kling_avatar import KlingAvatar
    
    kling = KlingAvatar()
    inputs = {
        "image_path": str(Path(image_path).resolve()),
        "audio_path": str(Path(audio_path).resolve()),
        "prompt": prompt or "subtle gentle head movement, natural eye blinking, expressive poetry recitation",
        "mode": "std",
        "output_path": str(Path(output_path).resolve())
    }
    
    print("Submitting task to Kling API and waiting for completion...")
    res = kling.execute(inputs)
    if not res.success:
        raise RuntimeError(f"Kling Avatar generation failed: {res.error}")
    
    print(f"✅ Kling Avatar finished successfully! Video saved to: {res.data.get('video_path') or output_path}")
    return res.data.get("video_path") or output_path


def upload_heygen_asset(file_path: str, content_type: str = "image/jpeg") -> str:
    api_key = os.getenv("HEYGEN_API_KEY")
    if not api_key:
        raise ValueError("HEYGEN_API_KEY not found in environment or .env file.")

    url = "https://upload.heygen.com/v1/asset"
    headers = {"X-Api-Key": api_key, "Content-Type": content_type}
    with open(file_path, "rb") as f:
        resp = requests.post(url, headers=headers, data=f, timeout=120)

    data = resp.json()
    if data.get("code") != 100:
        raise RuntimeError(f"HeyGen upload failed: {data}")
    return data["data"]["image_key"]


def render_with_heygen_avatar(image_path: str, poem_text: str, output_path: str) -> str:
    api_key = os.getenv("HEYGEN_API_KEY")
    if not api_key:
        raise ValueError("HEYGEN_API_KEY not found in environment or .env file.")

    image_key = upload_heygen_asset(image_path, content_type="image/jpeg")
    url = "https://api.heygen.com/v2/video/av4/generate"
    headers = {"X-Api-Key": api_key, "Content-Type": "application/json"}
    payload = {
        "image_key": image_key,
        "video_orientation": "portrait",
        "video_title": "Poem Talking Avatar",
        "fit": "cover",
        "script": poem_text,
        "custom_motion_prompt": "gentle subtle head movement, natural eye blinking, expressive poetry recitation, warm smile"
    }
    
    resp = requests.post(url, headers=headers, json=payload, timeout=60)
    data = resp.json()
    if data.get("error"):
        raise RuntimeError(f"HeyGen generation failed: {data.get('error')}")
    video_id = data["data"]["video_id"]
    
    # Poll
    poll_url = f"https://api.heygen.com/v1/video_status.get?video_id={video_id}"
    for _ in range(60):
        time.sleep(10)
        p_resp = requests.get(poll_url, headers={"X-Api-Key": api_key}, timeout=30)
        p_data = p_resp.json()
        status = p_data.get("data", {}).get("status")
        if status == "completed":
            video_url = p_data["data"]["video_url"]
            v_resp = requests.get(video_url, timeout=120)
            with open(output_path, "wb") as f:
                f.write(v_resp.content)
            return output_path
        elif status == "failed":
            raise RuntimeError(f"HeyGen rendering failed: {p_data.get('data', {}).get('error')}")
    raise TimeoutError("HeyGen rendering timed out.")


def main():
    parser = argparse.ArgumentParser(description="Create talking avatar video from photo and poem.")
    parser.add_argument("--image", default="assets/user_portrait.jpg", help="Path to portrait photograph")
    parser.add_argument("--poem", help="Poem text or lyrics")
    parser.add_argument("--poem-file", help="Path to text file containing poem")
    parser.add_argument("--output", default="renders/poem_talking_avatar.mp4", help="Output MP4 path")
    parser.add_argument("--voice", default="bn-BD-PradeepNeural", choices=["bn-BD-PradeepNeural", "bn-BD-NabanitaNeural", "bn-IN-BashkarNeural"], help="Voice name")
    parser.add_argument("--provider", default="kling", choices=["kling", "heygen"], help="Avatar provider")
    args = parser.parse_args()

    poem_text = args.poem
    if args.poem_file and os.path.exists(args.poem_file):
        with open(args.poem_file, "r", encoding="utf-8") as f:
            poem_text = f.read()

    if not poem_text:
        poem_text = (
            "মেঘ বলেছে যাব যাব, রাত বলেছে যাই,\n"
            "সাগর বলে কূল মিলেছে, আমি তো আর নাই।\n"
            "দুখের সাথে রইনু পড়ে নিশিদিশিন আমি,\n"
            "তোমার প্রেমে আঁধার রাতে আলো জ্বালো স্বামী।"
        )
        print("ℹ️ No poem text specified. Using default classic poem demo.")

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)

    print("====================================================")
    print(" 🎬 Poem to Talking Avatar Video Generator (Up to 180s) ")
    print("====================================================")
    print(f"Portrait Image : {args.image}")
    print(f"Poem Text      :\n{poem_text}")
    print(f"Voice          : {args.voice}")
    print(f"Provider       : {args.provider}")
    print(f"Output File    : {args.output}")
    print("====================================================")

    # 1. Generate Voice
    audio_file = generate_bengali_audio(poem_text, voice=args.voice, output_path="temp_recitation.mp3")

    # 2. Render Avatar Video
    if args.provider == "kling":
        final_video = render_with_kling_avatar(args.image, audio_file, args.output)
    else:
        final_video = render_with_heygen_avatar(args.image, poem_text, args.output)

    print(f"\n🎉 Finished! Output video is ready at: {final_video}")


if __name__ == "__main__":
    main()
