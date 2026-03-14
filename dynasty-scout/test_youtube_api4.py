#!/usr/bin/env python
"""Test the correct API pattern"""

from youtube_transcript_api import YouTubeTranscriptApi

test_video_id = "dQw4w9WgXcQ"

try:
    # Use list() to get TranscriptList
    print(f"Calling YouTubeTranscriptApi.list({test_video_id})...")
    transcript_list = YouTubeTranscriptApi.list(test_video_id)
    print(f"Got: {type(transcript_list)}")
    print(f"Methods: {[m for m in dir(transcript_list) if not m.startswith('_')]}")
    
    # Find English transcript
    transcript = transcript_list.find_transcript(['en'])
    print(f"\nFound transcript: {type(transcript)}")
    print(f"Transcript methods: {[m for m in dir(transcript) if not m.startswith('_')]}")
    
    # Fetch the actual data
    data = transcript.fetch()
    print(f"\nFetched {len(data)} segments")
    print(f"First segment: {data[0]}")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
