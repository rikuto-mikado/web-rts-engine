from django.core.management.base import BaseCommand

from game.seeding import seed_content


class Command(BaseCommand):
    help = "Create or refresh the default unit types, commanders and scenarios."

    def handle(self, *args, **options):
        counts = seed_content()
        self.stdout.write(self.style.SUCCESS(f"Seeded game content: {counts}"))
