from django.db import migrations


def _reseed(apps, schema_editor):
    # The Night Sappers (Tamsin Holt), the enemy's Rootcutters (Brother Gall) and their Saboteurs join the roster.
    from game.seeding import seed_content

    seed_content(apps)


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0016_three_crowns"),
    ]

    operations = [migrations.RunPython(_reseed, migrations.RunPython.noop)]
