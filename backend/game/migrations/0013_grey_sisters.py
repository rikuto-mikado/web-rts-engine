from django.db import migrations


def _reseed(apps, schema_editor):
    # The spymasters lead their fixed bands only: Mother Sereth's Grey Sisters join the roster text.
    from game.seeding import seed_content

    seed_content(apps)


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0012_whisper_blades"),
    ]

    operations = [migrations.RunPython(_reseed, migrations.RunPython.noop)]
