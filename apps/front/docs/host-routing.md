# آدرس‌ها و سطح‌های Athlore

فرانت یک build مشترک دارد، اما router با hostname سطح فعال را تعیین می‌کند:

| hostname | سطح | مسیرهای مرورگر |
| --- | --- | --- |
| `athlore.ir` | عمومی | فقط `/` برای Home |
| `coach.athlore.ir` | مربی | `/login`، `/dashboard`، `/students` و مسیرهای داخلی مربی |
| `student.athlore.ir` | شاگرد | `/login`، `/dashboard`، `/visits`، `/visits/:visitId`، `/body-check` |

هر مسیر خارج از سطح فعال، از جمله مسیرهای panel روی دامنه‌ی عمومی، 404 واقعی
می‌گیرد و redirect یا alias قدیمی ندارد. login نقش مقابل در صفحه‌های auth
نمایش داده نمی‌شود؛ Home عمومی تنها نقطه‌ای است که entry point هر دو نقش را
معرفی می‌کند.

در localhost، فقط در حالت development می‌توان با `VITE_DEV_APP_SURFACE` سطح
را برای همان host مشخص کرد. این fallback در build production فعال نیست.
