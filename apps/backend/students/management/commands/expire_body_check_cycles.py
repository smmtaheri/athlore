from django.core.management.base import BaseCommand

from students.body_check_services import expire_overdue_cycles


class Command(BaseCommand):
    help = "Mark Body Check cycles past their Tehran-local end date as expired."

    def handle(self, *args, **options):
        count = expire_overdue_cycles()
        self.stdout.write(self.style.SUCCESS(f"Expired {count} Body Check cycle(s)."))
