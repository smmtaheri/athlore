from django.db import migrations, models
import django.db.models.deletion
import uuid


ASSETS = [
    {
        "key": "bench",
        "title_fa": "پرس سینه هالتر",
        "title_en": "Bench press",
        "author": "FitnessScape",
        "source_url": "https://commons.wikimedia.org/wiki/File:Bench_press_-_exercise_demonstration_video.webm",
        "license_name": "CC BY 3.0",
        "license_url": "https://creativecommons.org/licenses/by/3.0/",
        "changes": "Resized and transcoded; tutorial reel repeats the original excerpt on a blurred portrait background. Persian cues are added by Athlore.",
        "education": {
            "description": "پرس افقی برای عضلات سینه؛ با مشارکت پشت بازو و سرشانهٔ جلویی.",
            "steps": [
                {"at_seconds": 0, "title": "جای‌گیری", "text": "پاها روی زمین، کتف‌ها ثابت و چشم‌ها زیر هالتر باشند."},
                {"at_seconds": 7, "title": "پایین‌آوردن", "text": "هالتر را آرام به سمت سینه پایین بیاور؛ مچ را صاف نگه دار."},
                {"at_seconds": 14, "title": "بالابردن", "text": "با حفظ ثبات بدن، هالتر را با کنترل به بالا برگردان."},
                {"at_seconds": 21, "title": "تنفس و ریتم", "text": "در مسیر پایین نفس بگیر و هنگام پرس بازدم کن."},
            ],
            "tips": ["وزنه‌ای انتخاب کن که در تمام تکرارها کنترلش را داشته باشی.", "برای ست سنگین از رک ایمن یا کمک یار تمرینی استفاده کن."],
            "mistakes": [{"title": "ضربه‌زدن به سینه", "text": "برای برگشت هالتر از ضربه و شتاب کمک نگیر."}, {"title": "جداشدن باسن", "text": "پا و باسن را ثابت نگه دار."}, {"title": "خم‌شدن مچ", "text": "وزنه نباید مچ را بیش از حد به عقب ببرد."}],
        },
        "names": ["پرس سینه هالتر", "پرس سینه تخت با هالتر", "Flat Barbell Bench Press"],
        "muscles": ["سینه"],
        "sort_order": 1,
    },
    {
        "key": "incline",
        "title_fa": "پرس بالاسینه هالتر",
        "title_en": "Incline press",
        "author": "FitnessScape",
        "source_url": "https://commons.wikimedia.org/wiki/File:Incline_press_-_exercise_demonstration_video.webm",
        "license_name": "CC BY 3.0",
        "license_url": "https://creativecommons.org/licenses/by/3.0/",
        "changes": "Resized and transcoded; tutorial reel repeats the original excerpt on a blurred portrait background. Persian cues are added by Athlore.",
        "education": {
            "description": "پرس روی نیمکت شیب‌دار با تمرکز بیشتر روی بخش بالایی سینه.",
            "steps": [{"at_seconds": 0, "title": "تنظیم نیمکت", "text": "شیب و ارتفاع رک را با راهنمای مربی تنظیم کن."}, {"at_seconds": 7, "title": "بدن ثابت", "text": "پاها روی زمین و کتف‌ها تکیه‌داده به نیمکت باشند."}, {"at_seconds": 14, "title": "مسیر حرکت", "text": "هالتر را با کنترل به سمت بالای سینه پایین بیاور."}, {"at_seconds": 21, "title": "برگشت آرام", "text": "بدون ضربه و با حفظ تعادل دو دست پرس کن."}],
            "tips": ["شیب بیشتر همیشه به معنی درگیری بهتر بالاسینه نیست؛ تنظیم مربی را رعایت کن.", "دامنهٔ حرکت باید با توان و کنترل شانه‌ها هماهنگ باشد."],
            "mistakes": [{"title": "شیب نامناسب", "text": "شیب خیلی زیاد، حرکت را به پرس سرشانه نزدیک می‌کند."}, {"title": "بازشدن بیش از حد آرنج", "text": "آرنج‌ها را به اجبار کاملاً به طرفین نبر."}, {"title": "پرس با شتاب", "text": "وزنه را با کنترل جابه‌جا کن."}],
        },
        "names": ["پرس بالاسینه هالتر", "پرس سینه بالاسینه با هالتر", "پرس بالا سینه هالتر", "Incline Barbell Bench Press"],
        "muscles": ["سینه", "سینه بالا", "بالاسینه"],
        "sort_order": 2,
    },
    {
        "key": "row",
        "title_fa": "پارویی هالتر خم",
        "title_en": "Bent-over row",
        "author": "FitnessScape",
        "source_url": "https://commons.wikimedia.org/wiki/File:Bent-over_row_-_exercise_demonstration_video.webm",
        "license_name": "CC BY 3.0",
        "license_url": "https://creativecommons.org/licenses/by/3.0/",
        "changes": "Resized and transcoded; tutorial reel repeats the original excerpt on a blurred portrait background. Persian cues are added by Athlore.",
        "education": {
            "description": "حرکت کششی برای عضلات پشت؛ ثبات تنه، بخش مهم اجرای آن است.",
            "steps": [{"at_seconds": 0, "title": "آماده‌سازی", "text": "از مفصل ران خم شو؛ زانوها کمی خم و تنه ثابت باشد."}, {"at_seconds": 7, "title": "کشیدن", "text": "آرنج‌ها را به عقب ببر و هالتر را به سمت تنه بکش."}, {"at_seconds": 14, "title": "مکث کوتاه", "text": "در انتهای کشش، وضعیت کمر و کتف‌ها را کنترل کن."}, {"at_seconds": 21, "title": "برگشت", "text": "وزنه را آرام پایین بیاور؛ زاویهٔ تنه را حفظ کن."}],
            "tips": ["به زمینِ کمی جلوتر نگاه کن تا گردن در امتداد تنه بماند.", "وزنه را سبک کن اگر مجبور می‌شوی با تنه تاب بدهی."],
            "mistakes": [{"title": "تاب‌دادن تنه", "text": "زاویهٔ تنه نباید با هر تکرار مرتب عوض شود."}, {"title": "گردشدن کمر", "text": "ستون فقرات را در وضعیت کنترل‌شده نگه دار."}, {"title": "کشیدن با شتاب", "text": "حرکت آرنج و کنترل کتف را جایگزین پرتاب وزنه کن."}],
        },
        "names": ["پارویی هالتر خم", "روئینگ هالتر خمیده", "Bent-over row", "Bent-over Barbell Row"],
        "muscles": ["زیربغل", "پشت"],
        "sort_order": 3,
    },
    {
        "key": "shoulder",
        "title_fa": "پرس سرشانه هالتر",
        "title_en": "Shoulder press",
        "author": "FitnessScape",
        "source_url": "https://commons.wikimedia.org/wiki/File:Shoulder_press_-_exercise_demonstration_video.webm",
        "license_name": "CC BY 3.0",
        "license_url": "https://creativecommons.org/licenses/by/3.0/",
        "changes": "Resized and transcoded; tutorial reel repeats the original excerpt on a blurred portrait background. Persian cues are added by Athlore.",
        "education": {
            "description": "پرس برای سرشانه‌ها؛ با حفظ ثبات پاها و میان‌تنه.",
            "steps": [{"at_seconds": 0, "title": "شروع", "text": "پاها ثابت، هالتر جلوی شانه و میان‌تنه درگیر باشد."}, {"at_seconds": 7, "title": "بالابردن", "text": "هالتر را با کنترل رو به بالا هدایت کن."}, {"at_seconds": 14, "title": "ثبات", "text": "تنه را ثابت نگه دار و وزنه را متعادل کنترل کن."}, {"at_seconds": 21, "title": "برگشت", "text": "آرام به موقعیت شروع برگرد و تکرار بعدی را آغاز کن."}],
            "tips": ["اگر برای پرس مجبور به قوس زیاد کمر شدی، وزنه را سبک کن.", "دامنهٔ راحت شانه را با مربی هماهنگ کن."],
            "mistakes": [{"title": "قوس زیاد کمر", "text": "وزنه را با عقب‌دادن شدید تنه بالا نبر."}, {"title": "کمک ناخواسته از پا", "text": "در نسخهٔ ایستاده با زانوها وزنه را پرتاب نکن."}, {"title": "پایین‌آوردن رها", "text": "بخش برگشت هم باید کنترل‌شده باشد."}],
        },
        "names": ["پرس سرشانه هالتر", "پرس سرشانه با هالتر", "Barbell Shoulder Press", "Shoulder Press"],
        "muscles": ["سرشانه"],
        "sort_order": 4,
    },
    {
        "key": "pullup",
        "title_fa": "بارفیکس دست باز",
        "title_en": "Wide-grip pull-up",
        "author": "FitnessScape",
        "source_url": "https://commons.wikimedia.org/wiki/File:Pull-ups_-_exercise_demonstration_video.webm",
        "license_name": "CC BY 3.0",
        "license_url": "https://creativecommons.org/licenses/by/3.0/",
        "changes": "Resized and transcoded; tutorial reel repeats the original excerpt on a blurred portrait background. Persian cues are added by Athlore.",
        "education": {
            "description": "کشش عمودی با وزن بدن برای عضلات پشت؛ این ویدئو نسخهٔ دست‌باز را نشان می‌دهد.",
            "steps": [{"at_seconds": 0, "title": "گرفتن میله", "text": "میله را محکم و با فاصلهٔ دستِ متناسب بگیر؛ بدن را پیش از شروع ثابت کن."}, {"at_seconds": 7, "title": "بالاکشیدن", "text": "با کنترل آرنج‌ها خودت را به سمت میله بالا بکش."}, {"at_seconds": 14, "title": "بدون تاب", "text": "پاها و تنه را بی‌جهت به عقب و جلو حرکت نده."}, {"at_seconds": 21, "title": "پایین‌آمدن", "text": "بدون رهاکردن ناگهانی وزن، با کنترل پایین بیا."}],
            "tips": ["اگر نسخهٔ کامل سخت است، نسخهٔ کمکی را از مربی بپرس.", "کیفیت چند تکرار کنترل‌شده از تعداد زیاد با تاب‌دادن مهم‌تر است."],
            "mistakes": [{"title": "تاب‌دادن پاها", "text": "از شتاب پاها برای بالا رفتن کمک نگیر."}, {"title": "بالابردن چانه با گردن", "text": "برای رسیدن به میله، گردن را بیش از حد جلو نده."}, {"title": "رهاشدن در برگشت", "text": "کاهش ارتفاع بدن هم بخشی از حرکت است."}],
        },
        "names": ["بارفیکس دست باز", "بارفیکس دست باز از جلو", "Wide-grip Pull-up"],
        "muscles": ["زیربغل"],
        "sort_order": 5,
    },
    {
        "key": "squat",
        "title_fa": "اسکوات هالتر",
        "title_en": "Squat",
        "author": "FitnessScape",
        "source_url": "https://commons.wikimedia.org/wiki/File:Squat_-_exercise_demonstration_video.webm",
        "license_name": "CC BY 3.0",
        "license_url": "https://creativecommons.org/licenses/by/3.0/",
        "changes": "Resized and transcoded; tutorial reel repeats the original excerpt on a blurred portrait background. Persian cues are added by Athlore.",
        "education": {
            "description": "حرکت چندمفصلی پایین‌تنه برای پاها و باسن؛ با دامنهٔ متناسب با توان فرد.",
            "steps": [{"at_seconds": 0, "title": "آماده‌سازی", "text": "هالتر را روی بخش مناسب پشت قرار بده و جای پاها را تنظیم کن."}, {"at_seconds": 7, "title": "نشستن", "text": "با خم‌کردن زانو و ران، با کنترل پایین برو."}, {"at_seconds": 14, "title": "کنترل مسیر", "text": "کف پا را روی زمین نگه دار و زانوها را در مسیر پنجه‌ها هدایت کن."}, {"at_seconds": 21, "title": "بلندشدن", "text": "با فشار متعادل پاها به زمین، به حالت ایستاده برگرد."}],
            "tips": ["عمق اسکوات را با کنترل تنه و راهنمای مربی تنظیم کن.", "رک و پایه‌های ایمنی را قبل از شروع تنظیم کن."],
            "mistakes": [{"title": "فروریختن زانو به داخل", "text": "مسیر زانو را با جهت پنجه‌ها هماهنگ نگه دار."}, {"title": "بلندشدن پاشنه", "text": "تعادل را به پنجه‌ها منتقل نکن."}, {"title": "عجله در پایین‌رفتن", "text": "برای تغییر جهت، کنترل حرکت را از دست نده."}],
        },
        "names": ["اسکوات هالتر", "اسکات با هالتر (پشت)", "Back Squat", "Barbell Back Squat"],
        "muscles": ["پا", "چهارسر"],
        "sort_order": 6,
    },
    {
        "key": "deadlift",
        "title_fa": "ددلیفت هالتر",
        "title_en": "Deadlift",
        "author": "FitnessScape",
        "source_url": "https://commons.wikimedia.org/wiki/File:Deadlift_-_exercise_demonstration_video.webm",
        "license_name": "CC BY 3.0",
        "license_url": "https://creativecommons.org/licenses/by/3.0/",
        "changes": "Resized and transcoded; tutorial reel repeats the original excerpt on a blurred portrait background. Persian cues are added by Athlore.",
        "education": {
            "description": "حرکت مفصل ران برای زنجیرهٔ خلفی؛ با نزدیک‌بودن هالتر به بدن و تنهٔ ثابت.",
            "steps": [{"at_seconds": 0, "title": "وضعیت شروع", "text": "میله را نزدیک ساق قرار بده و از مفصل ران خم شو."}, {"at_seconds": 7, "title": "آمادهٔ کشش", "text": "میان‌تنه را ثابت کن و پیش از بلندکردن، کنترل میله را بگیر."}, {"at_seconds": 14, "title": "بالاآمدن", "text": "با فشار پاها و بازشدن ران، میله را نزدیک بدن بالا بیاور."}, {"at_seconds": 21, "title": "پایین‌آوردن", "text": "با عقب‌بردن ران و حفظ کنترل تنه، وزنه را پایین ببر."}],
            "tips": ["اگر تکنیک ناپایدار است، پیش از افزایش وزنه از مربی کمک بگیر.", "برای پایان حرکت صاف بایست؛ لازم نیست به عقب خم شوی."],
            "mistakes": [{"title": "دورشدن هالتر", "text": "میله را بی‌دلیل از ساق و ران دور نکن."}, {"title": "گردشدن تنه", "text": "برای بلندکردن وزنه، کنترل ستون فقرات را از دست نده."}, {"title": "کشیدن ناگهانی", "text": "شروع حرکت را با ضربه و شتاب انجام نده."}],
        },
        "names": ["ددلیفت هالتر", "ددلیفت کلاسیک", "ددلیفت معمولی", "Conventional Deadlift"],
        "muscles": ["زیربغل", "پا", "پشت پا"],
        "sort_order": 7,
    },
    {
        "key": "legraise",
        "title_fa": "بالاآوردن پا آویزان",
        "title_en": "Hanging leg raise",
        "author": "FitnessScape",
        "source_url": "https://commons.wikimedia.org/wiki/File:Leg_raises_-_exercise_demonstration_video.webm",
        "license_name": "CC BY 3.0",
        "license_url": "https://creativecommons.org/licenses/by/3.0/",
        "changes": "Resized and transcoded; tutorial reel repeats the original excerpt on a blurred portrait background. Persian cues are added by Athlore.",
        "education": {
            "description": "حرکت شکم در حالت آویزان؛ با کنترل لگن و بدون تاب‌دادن بدن.",
            "steps": [{"at_seconds": 0, "title": "شروع ثابت", "text": "از میله آویزان شو و ابتدا تعادل بدن را پیدا کن."}, {"at_seconds": 7, "title": "بالاآوردن", "text": "پاها را بدون تاب و با کنترل بالا بیاور."}, {"at_seconds": 14, "title": "دامنهٔ مناسب", "text": "تا جایی ادامه بده که لگن و تنه تحت کنترل باشند."}, {"at_seconds": 21, "title": "برگشت", "text": "پاها را آرام پایین بیاور و قبل از تکرار بعدی ثابت شو."}],
            "tips": ["دامنه را برای حفظ کنترل کوتاه‌تر کن؛ تعداد تکرار اجباری نیست.", "در صورت نیاز، نسخهٔ زانوخم را با مربی هماهنگ کن."],
            "mistakes": [{"title": "تاب‌خوردن بدن", "text": "از حرکت رفت‌وبرگشتی بدن برای بالا آوردن پاها کمک نگیر."}, {"title": "رهاکردن پاها", "text": "پایین‌آوردن هم باید آرام باشد."}, {"title": "دامنهٔ بیش از توان", "text": "وقتی کنترل لگن از دست می‌رود دامنه را کمتر کن."}],
        },
        "names": ["بالاآوردن پا آویزان", "زیرشکم پا از هوا با بارفیکس (آویزان)", "Hanging Leg Raise"],
        "muscles": ["شکم زیر", "شکم", "میان‌تنه"],
        "sort_order": 8,
    },
    {
        "key": "crunch",
        "title_fa": "جمع‌کردن زانو آویزان",
        "title_en": "Hanging crunches",
        "author": "FitnessScape",
        "source_url": "https://commons.wikimedia.org/wiki/File:Hanging_crunches_-_exercise_demonstration_video.webm",
        "license_name": "CC BY 3.0",
        "license_url": "https://creativecommons.org/licenses/by/3.0/",
        "changes": "Resized and transcoded; tutorial reel repeats the original excerpt on a blurred portrait background. Persian cues are added by Athlore.",
        "education": {
            "description": "جمع‌کردن کنترل‌شدهٔ زانوها در حالت آویزان برای تمرین میان‌تنه.",
            "steps": [{"at_seconds": 0, "title": "تعادل", "text": "با گرفتن محکم میله، بدن را ثابت نگه دار."}, {"at_seconds": 7, "title": "جمع‌کردن", "text": "زانوها را به‌آرامی به سمت تنه جمع کن."}, {"at_seconds": 14, "title": "کنترل لگن", "text": "دامنه‌ای را انتخاب کن که تنه تاب نخورد."}, {"at_seconds": 21, "title": "بازگشت", "text": "زانوها را با کنترل پایین بیاور و دوباره ثابت شو."}],
            "tips": ["بین تکرارها عجله نکن و نگذار بدن آونگ شود.", "شانه و دست‌ها را در حالت آویزان تحت کنترل نگه دار."],
            "mistakes": [{"title": "تاب‌دادن به جای جمع‌کردن", "text": "حرکت را با کنترل شکم و لگن انجام بده."}, {"title": "افتادن ناگهانی پاها", "text": "برگشت را رها نکن."}, {"title": "کشیدن سر به جلو", "text": "گردن را در وضعیت راحت و کنترل‌شده نگه دار."}],
        },
        "names": ["جمع‌کردن زانو آویزان", "جمع کردن زانو آویزان", "Hanging Crunch", "Hanging Crunches"],
        "muscles": ["شکم", "میان‌تنه"],
        "sort_order": 9,
    },
    {
        "key": "plank",
        "title_fa": "پلانک ساعد",
        "title_en": "Forearm plank",
        "author": "Cpl. Quinn Hurt, U.S. Marine Corps",
        "source_url": "https://www.dvidshub.net/video/753559/7-foundational-movements-plank",
        "license_name": "U.S. federal government work; see DVIDS use limitations",
        "license_url": "https://www.dvidshub.net/about/copyright",
        "changes": "Silent 1.3-second forearm plank excerpt repeated on a blurred portrait background. Persian cues are added by Athlore.",
        "disclaimer": "The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement.",
        "education": {
            "description": "حرکت ثابت و زمان‌دار برای کنترل میان‌تنه؛ کیفیت وضعیت بدن مهم‌تر از طول زمان است.",
            "steps": [{"at_seconds": 0, "title": "جای‌گیری", "text": "ساعدها روی زمین و آرنج‌ها نزدیک زیر شانه باشند."}, {"at_seconds": 7, "title": "امتداد بدن", "text": "سر، تنه و پاها را در یک امتداد کنترل‌شده قرار بده."}, {"at_seconds": 14, "title": "انقباض و تنفس", "text": "شکم و باسن را درگیر کن و نفس را حبس نکن."}, {"at_seconds": 21, "title": "حفظ کیفیت", "text": "تا زمانی نگه دار که فرم درست باقی بماند؛ زمان تجویزشده را رعایت کن."}],
            "tips": ["به نقطه‌ای روی زمین نگاه کن؛ گردن را بالا نگیر.", "اگر حفظ فرم سخت شد، زمان کوتاه‌تر یا نسخهٔ آسان‌تر را با مربی هماهنگ کن."],
            "mistakes": [{"title": "افتادن لگن", "text": "کمر را رها نکن و شکم را فعال نگه دار."}, {"title": "بالابردن زیاد باسن", "text": "بدن را به شکل هرم درنیاور."}, {"title": "حبس نفس", "text": "در طول نگه‌داشتن حرکت، آرام و پیوسته نفس بکش."}],
        },
        "names": ["پلانک ساعد", "Forearm Plank"],
        "muscles": ["شکم", "میان‌تنه"],
        "sort_order": 10,
    },
]


def seed_assets_and_exact_links(apps, schema_editor):
    Exercise = apps.get_model("accounts", "Exercise")
    ExerciseMediaAsset = apps.get_model("accounts", "ExerciseMediaAsset")
    db = schema_editor.connection.alias

    for row in ASSETS:
        exact_names = row["names"]
        exact_muscles = row["muscles"]
        key = row["key"]
        defaults = {
            field: value
            for field, value in row.items()
            if field not in {"names", "muscles"}
        }
        paths = {
            "preview_path": f"/media/workout/{key}-preview.mp4",
            "poster_path": f"/media/workout/{key}.jpg",
            "reel_path": f"/media/workout/{key}-reel.mp4",
        }
        asset, _ = ExerciseMediaAsset.objects.using(db).update_or_create(
            key=key, defaults={**defaults, **paths}
        )
        candidates = Exercise.objects.using(db).filter(
            media_asset__isnull=True,
            is_active=True,
            is_archived=False,
            primary_muscle__in=exact_muscles,
        ).filter(models.Q(name__in=exact_names) | models.Q(name_en__in=exact_names))
        candidates.update(media_asset_id=asset.pk)


def unseed_assets_and_exact_links(apps, schema_editor):
    Exercise = apps.get_model("accounts", "Exercise")
    ExerciseMediaAsset = apps.get_model("accounts", "ExerciseMediaAsset")
    db = schema_editor.connection.alias
    keys = [item["key"] for item in ASSETS]
    Exercise.objects.using(db).filter(media_asset__key__in=keys).update(media_asset=None)
    ExerciseMediaAsset.objects.using(db).filter(key__in=keys).delete()


class Migration(migrations.Migration):
    dependencies = [("accounts", "0019_program_defaults_and_exercise_guides")]

    operations = [
        migrations.CreateModel(
            name="ExerciseMediaAsset",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("key", models.SlugField(max_length=40, unique=True)),
                ("title_fa", models.CharField(max_length=160)),
                ("title_en", models.CharField(blank=True, default="", max_length=160)),
                ("author", models.CharField(max_length=160)),
                ("source_url", models.URLField(max_length=1024)),
                ("license_name", models.CharField(max_length=160)),
                ("license_url", models.URLField(max_length=1024)),
                ("changes", models.TextField(blank=True, default="")),
                ("preview_path", models.CharField(max_length=255)),
                ("poster_path", models.CharField(max_length=255)),
                ("reel_path", models.CharField(max_length=255)),
                ("education", models.JSONField(blank=True, default=dict)),
                ("disclaimer", models.TextField(blank=True, default="")),
                ("is_active", models.BooleanField(default=True)),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
            ],
            options={"ordering": ["sort_order", "title_fa"]},
        ),
        migrations.AddField(
            model_name="exercise",
            name="media_asset",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="exercises",
                to="accounts.exercisemediaasset",
            ),
        ),
        migrations.RunPython(seed_assets_and_exact_links, unseed_assets_and_exact_links),
    ]
