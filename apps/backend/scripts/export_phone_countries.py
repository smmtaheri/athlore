"""Print factual mobile country metadata for the frontend country selector.

Run from apps/backend: uv run python scripts/export_phone_countries.py
The JSON belongs at apps/front/src/shared/phone/countries.json.
Validation of complete numbering patterns remains authoritative on the server.
"""

import json

import phonenumbers
from phonenumbers.phonemetadata import PhoneMetadata

countries = []
for country in sorted(phonenumbers.SUPPORTED_REGIONS):
    metadata = PhoneMetadata.metadata_for_region(country)
    mobile = metadata.mobile
    if not mobile or not mobile.example_number or not mobile.possible_length:
        continue
    countries.append(
        {
            "country": country,
            "callingCode": str(metadata.country_code),
            "example": mobile.example_number,
            "lengths": list(mobile.possible_length),
            "main": bool(metadata.main_country_for_code),
        }
    )
print(
    json.dumps(
        {"source": f"python-phonenumbers {phonenumbers.__version__}", "countries": countries},
        indent=2,
    )
)
