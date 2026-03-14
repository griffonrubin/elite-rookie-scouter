#!/usr/bin/env python
"""Test script to find correct youtube-transcript-api usage"""

try:
    import youtube_transcript_api
    print(f"Module contents: {dir(youtube_transcript_api)}")
    
    # Try different import patterns
    from youtube_transcript_api import YouTubeTranscriptApi
    
    # Check if it's an instance method
    api_instance = YouTubeTranscriptApi()
    print(f"\nInstance methods: {[m for m in dir(api_instance) if not m.startswith('_')]}")
    
    # Test with instance
    test_video_id = "dQw4w9WgXcQ"
    print(f"\nTrying instance.get_transcript({test_video_id})...")
    transcript = api_instance.get_transcript(test_video_id)
    print(f"Success! Got {len(transcript)} segments")
    
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
