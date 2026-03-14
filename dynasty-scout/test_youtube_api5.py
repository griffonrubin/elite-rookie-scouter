#!/usr/bin/env python
"""Test the correct API pattern with instance"""

from youtube_transcript_api import YouTubeTranscriptApi

test_video_id = "dQw4w9WgXcQ"

try:
    # Create instance and use list()
    api = YouTubeTranscriptApi()
    print(f"Calling api.list({test_video_id})...")
    transcript_list = api.list(test_video_id)
    print(f"Got: {type(transcript_list)}")
    
    # Find English transcript
    transcript = transcript_list.find_transcript(['en'])
    print(f"Found transcript: {type(transcript)}")
    
    # Fetch the actual data
    data = transcript.fetch()
    print(f"Fetched {len(data)} segments")
    print(f"First 3 segments:")
    for seg in data[:3]:
        print(f"  {seg}")
    
    print("\n✓ SUCCESS! This is the correct pattern.")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
