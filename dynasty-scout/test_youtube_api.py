#!/usr/bin/env python
"""Test script to verify youtube-transcript-api usage"""

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    print(f"Import successful")
    print(f"Available methods: {dir(YouTubeTranscriptApi)}")
    
    # Test with a known video
    test_video_id = "dQw4w9WgXcQ"  # Rick Astley - Never Gonna Give You Up
    print(f"\nTrying to fetch transcript for {test_video_id}...")
    
    transcript = YouTubeTranscriptApi.get_transcript(test_video_id)
    print(f"Success! Got {len(transcript)} transcript segments")
    print(f"First segment: {transcript[0]}")
    
except ImportError as e:
    print(f"Import error: {e}")
except AttributeError as e:
    print(f"Attribute error: {e}")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
