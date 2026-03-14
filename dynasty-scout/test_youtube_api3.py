#!/usr/bin/env python
"""Find the correct way to use youtube-transcript-api"""

import youtube_transcript_api

# Check what's exported at module level
print("Module-level exports:")
for item in dir(youtube_transcript_api):
    if not item.startswith('_'):
        obj = getattr(youtube_transcript_api, item)
        print(f"  {item}: {type(obj)}")

# Try the _api submodule
print("\n_api submodule:")
from youtube_transcript_api import _api
print(dir(_api))

# Check if there's a function at module level
print("\nTrying module-level function...")
try:
    from youtube_transcript_api import YouTubeTranscriptApi
    # Maybe it's in the _api module?
    from youtube_transcript_api._api import YouTubeTranscriptApi as API
    print(f"API class methods: {[m for m in dir(API) if not m.startswith('_')]}")
    
    # Try static method
    test_video_id = "dQw4w9WgXcQ"
    transcript = API.get_transcript(test_video_id)
    print(f"Success with static method! Got {len(transcript)} segments")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
