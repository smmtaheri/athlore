from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from students.models import StagedVisitPhoto, VisitPhoto


@receiver(post_delete, sender=VisitPhoto)
def delete_visit_photo_file_after_commit(sender, instance: VisitPhoto, **kwargs) -> None:
    if not instance.file:
        return
    storage = instance.file.storage
    name = instance.file.name
    transaction.on_commit(lambda: storage.delete(name))


@receiver(post_delete, sender=StagedVisitPhoto)
def delete_staged_visit_photo_file_after_commit(
    sender, instance: StagedVisitPhoto, **kwargs
) -> None:
    if not instance.file:
        return
    storage = instance.file.storage
    name = instance.file.name

    def delete_if_uncommitted():
        if not VisitPhoto.objects.filter(file=name).exists():
            storage.delete(name)

    transaction.on_commit(delete_if_uncommitted)
