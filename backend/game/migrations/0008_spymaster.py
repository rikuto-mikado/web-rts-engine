from django.db import migrations


def _reseed(apps, schema_editor):
    # The King's spymaster joins the roster: Corvin Ashe, Master of Whispers.
    from game.seeding import seed_content

    seed_content(apps)


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0007_last_stand_difficulty"),
    ]

    operations = [migrations.RunPython(_reseed, migrations.RunPython.noop)]
