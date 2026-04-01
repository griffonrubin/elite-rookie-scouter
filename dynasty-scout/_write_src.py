import base64, sys
data = base64.b64decode(sys.argv[1])
with open(sys.argv[2], "wb") as out:
    out.write(data)
print("Written", len(data), "bytes to", sys.argv[2])
