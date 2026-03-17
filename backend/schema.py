from pydantic import BaseModel, field_validator


class ImageData(BaseModel):
    image: str
    dict_of_vars: dict

    @field_validator('dict_of_vars')
    @classmethod
    def validate_vars(cls, v: dict) -> dict:
        if len(v) > 50:
            raise ValueError('Too many variables (max 50)')
        for key, val in v.items():
            if not isinstance(key, str) or len(key) > 50:
                raise ValueError(f'Invalid variable name: {key}')
            if not isinstance(val, (str, int, float)):
                raise ValueError(f'Invalid variable value for {key}')
        return v
