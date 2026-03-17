from fastapi import APIRouter, HTTPException
import base64
from io import BytesIO
from apps.calculator.utils import analyze_image
from schema import ImageData
from PIL import Image

router = APIRouter()

MAX_IMAGE_SIZE = 1024
MAX_PAYLOAD_BYTES = 10 * 1024 * 1024  # 10MB limit

@router.post('')
async def run(data: ImageData):
    # Validate image data format
    if ',' not in data.image:
        raise HTTPException(status_code=400, detail="Invalid image format: missing data URI prefix")

    # Check payload size
    raw = data.image.split(",")[1]
    if len(raw) > MAX_PAYLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 10MB)")

    try:
        image_data = base64.b64decode(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    try:
        image_bytes = BytesIO(image_data)
        image = Image.open(image_bytes)
        image.verify()
        # Re-open after verify (verify exhausts the stream)
        image_bytes.seek(0)
        image = Image.open(image_bytes)
    except Exception:
        raise HTTPException(status_code=400, detail="Cannot open image: unsupported or corrupted format")

    # Resize large images for faster AI processing
    w, h = image.size
    if w > MAX_IMAGE_SIZE or h > MAX_IMAGE_SIZE:
        ratio = min(MAX_IMAGE_SIZE / w, MAX_IMAGE_SIZE / h)
        image = image.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    try:
        responses = analyze_image(image, dict_of_vars=data.dict_of_vars)
    except Exception as e:
        import traceback
        traceback.print_exc()
        err_msg = str(e).lower()
        if "429" in str(e) or "quota" in err_msg or "rate" in err_msg or "resource_exhausted" in err_msg:
            raise HTTPException(status_code=429, detail="Rate limit exceeded — please wait a moment and try again")
        raise HTTPException(status_code=502, detail=f"AI processing failed: {type(e).__name__}: {str(e)}")

    if not responses:
        return {
            "message": "Could not recognize any expressions",
            "data": [],
            "status": "empty"
        }

    return {"message": "Image processed", "data": responses, "status": "success"}
