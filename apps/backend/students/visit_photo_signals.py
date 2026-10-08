from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from students.models import VisitPhoto


@receiver(post_delete, sender=VisitPhoto)
def delete_visit_photo_file_after_commit(sender, instance: VisitPhoto, **kwargs) -> None:
    if not instance.file:
        return
    storage = instance.file.storage
    name = instance.file.name
    transaction.on_commit(lambda: storage.delete(name))
