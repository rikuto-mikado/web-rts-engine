from django.db import migrations


def _reseed(apps, schema_editor):
    # Corvin Ashe takes the field with his Whisper Blades: new strengths and weaknesses on his card.
    from game.seeding import seed_content

    seed_content(apps)


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0011_long_night_mode"),
    ]

    operations = [migrations.RunPython(_reseed, migrations.RunPython.noop)]
