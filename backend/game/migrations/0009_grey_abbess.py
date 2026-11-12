from django.db import migrations


def _reseed(apps, schema_editor):
    # The Usurper gets a spymaster of her own: Mother Sereth, the Grey Abbess.
    from game.seeding import seed_content

    seed_content(apps)


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0008_spymaster"),
    ]

    operations = [migrations.RunPython(_reseed, migrations.RunPython.noop)]
