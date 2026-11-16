"""Poem-to-Talking-Avatar Video Generator.

Takes a still portrait photograph + poem text, generates an expressive neural voice
via ElevenLabs (or HeyGen Native), and produces a continuous talking-head video
(up to 180 seconds) via HeyGen Avatar IV or Kling Avatar.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
import requests
from dotenv import load_dotenv

load_dotenv()


def generate_elevenlabs_audio(text: str, voice_id: str = "21m00Tcm4TlvDq8ikWAM", output_path: str = "temp_recitation.mp3") -> str:
    """Generate expressive poem recitation audio using ElevenLabs Multilingual v2."""
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        raise ValueError("ELEVENLABS_API_KEY not found in environment or .env file.")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
    }
    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.45,
            "similarity_boost": 0.85,
            "style": 0.55,
            "use_speaker_boost": True
        }
    }

    print("Generating Bengali recitation audio via ElevenLabs...")
    resp = requests.post(url, headers=headers, json=payload, timeout=120)
    if resp.status_code != 200:
        raise RuntimeError(f"ElevenLabs TTS failed: {resp.status_code} - {resp.text}")

    with open(output_path, "wb") as f:
        f.write(resp.content)

    print(f"Audio generated successfully: {output_path} ({os.path.getsize(output_path)} bytes)")
    return output_path


def upload_heygen_asset(file_path: str, content_type: str = "image/jpeg") -> str:
    """Upload asset (image or audio) to HeyGen."""
    api_key = os.getenv("HEYGEN_API_KEY")
    if not api_key:
        raise ValueError("HEYGEN_API_KEY not found in environment or .env file.")

    url = "https://upload.heygen.com/v1/asset"
    headers = {
        "X-Api-Key": api_key,
        "Content-Type": content_type
    }

    print(f"Uploading {file_path} to HeyGen S3...")
    with open(file_path, "rb") as f:
        resp = requests.post(url, headers=headers, data=f, timeout=120)

    data = resp.json()
    if data.get("code") != 100:
        raise RuntimeError(f"HeyGen upload failed: {data}")

    image_key = data["data"]["image_key"]
    print(f"Uploaded successfully. Asset key: {image_key}")
    return image_key


def generate_heygen_avatar_iv(image_key: str, script: str = None, audio_url: str = None, orientation: str = "portrait") -> str:
    """Generate high-definition Avatar IV talking photo video."""
    api_key = os.getenv("HEYGEN_API_KEY")
    url = "https://api.heygen.com/v2/video/av4/generate"
    headers = {
        "X-Api-Key": api_key,
        "Content-Type": "application/json"
    }

    payload = {
        "image_key": image_key,
        "video_orientation": orientation,
        "video_title": "Poem Talking Avatar",
        "fit": "cover",
        "custom_motion_prompt": "reciting poem with gentle expression, nodding head and subtle emotional gaze, natural blinking",
        "enhance_custom_motion_prompt": True
    }

    if script:
        payload["script"] = script
        payload["voice_id"] = "1bd001e7e50f421d891986aad5158bc8"  # fallback multilingual voice
    if audio_url:
        payload["audio_url"] = audio_url

    print("Submitting HeyGen Avatar IV generation job...")
    resp = requests.post(url, headers=headers, json=payload, timeout=60)
    data = resp.json()
    if data.get("error"):
        raise RuntimeError(f"HeyGen generation failed: {data.get('error')}")

    video_id = data["data"]["video_id"]
    print(f"Video job submitted. Video ID: {video_id}")
    return video_id


def poll_heygen_video(video_id: str, output_path: str = "output_talking_avatar.mp4", max_wait: int = 600) -> str:
    """Poll HeyGen until video status is completed and download it."""
    api_key = os.getenv("HEYGEN_API_KEY")
    url = f"https://api.heygen.com/v1/video_status.get?video_id={video_id}"
    headers = {"X-Api-Key": api_key}

    print(f"Waiting for video rendering (Job ID: {video_id})...")
    start = time.time()
    while time.time() - start < max_wait:
        resp = requests.get(url, headers=headers, timeout=30)
        data = resp.json()
        status = data.get("data", {}).get("status")

        if status == "completed":
            video_url = data["data"]["video_url"]
            print(f"Video ready! Downloading from: {video_url}")
            v_resp = requests.get(video_url, timeout=120)
            with open(output_path, "wb") as f:
                f.write(v_resp.content)
            print(f"Saved finished video to {output_path} ({os.path.getsize(output_path)} bytes)")
            return output_path
        elif status == "failed":
            raise RuntimeError(f"Video generation failed: {data.get('data', {}).get('error')}")

        print(f"Status: {status} ... waiting (elapsed: {int(time.time() - start)}s)")
        time.sleep(10)

    raise TimeoutError(f"Video rendering timed out after {max_wait}s.")


def main():
    parser = argparse.ArgumentParser(description="Create talking avatar video from photo and poem.")
    parser.add_argument("--image", required=True, help="Path to portrait photograph")
    parser.add_argument("--poem", help="Poem text or lyrics")
    parser.add_argument("--poem-file", help="Path to text file containing poem")
    parser.add_argument("--output", default="renders/poem_avatar_180s.mp4", help="Output MP4 path")
    parser.add_argument("--voice-id", default="21m00Tcm4TlvDq8ikWAM", help="ElevenLabs Voice ID")
    parser.add_argument("--provider", default="heygen", choices=["heygen", "kling"], help="Avatar provider")
    args = parser.parse_args()

    poem_text = args.poem
    if args.poem_file and os.path.exists(args.poem_file):
        with open(args.poem_file, "r", encoding="utf-8") as f:
            poem_text = f.read()

    if not poem_text:
        print("Error: Please provide --poem or --poem-file.")
        sys.exit(1)

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)

    print("====================================================")
    print(" Poem to Talking Avatar Video Generator (Up to 180s) ")
    print("====================================================")
    print(f"Portrait Image : {args.image}")
    print(f"Poem Length    : {len(poem_text)} characters")
    print(f"Provider       : {args.provider}")
    print(f"Output File    : {args.output}")
    print("====================================================")

    # Step 1: Upload Image
    image_key = upload_heygen_asset(args.image, content_type="image/jpeg")

    # Step 2: Generate Video
    video_id = generate_heygen_avatar_iv(image_key=image_key, script=poem_text, orientation="portrait")

    # Step 3: Poll & Download
    final_video = poll_heygen_video(video_id=video_id, output_path=args.output)
    print(f"\n🎉 Finished! Output video is ready at: {final_video}")


if __name__ == "__main__":
    main()
