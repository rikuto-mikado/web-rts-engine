import uuid

from django.db import models


class Faction(models.TextChoices):
    PLAYER = "player", "Player"
    ENEMY = "enemy", "Enemy"
    NEUTRAL = "neutral", "Neutral"


class UnitType(models.Model):
    """A troop type that can be recruited and assigned to armies.

    Balance values live in the database so they can be tuned from the Django
    admin without touching frontend code.
    """

    key = models.SlugField(primary_key=True, max_length=40)
    name = models.CharField(max_length=80)
    role = models.CharField(
        max_length=120, help_text="Short tactical role shown in the UI"
    )
    description = models.TextField(blank=True)
    category = models.CharField(
        max_length=20,
        choices=[
            ("infantry", "Infantry"),
            ("ranged", "Ranged"),
            ("cavalry", "Cavalry"),
            ("siege", "Siege"),
        ],
    )
    attack = models.FloatField(help_text="Damage dealt per soldier")
    defense = models.FloatField(help_text="Damage needed to remove one soldier")
    speed = models.FloatField(
        help_text="Relative march speed (1.0 = standard infantry)"
    )
    siege_power = models.FloatField(default=0.0, help_text="Wall damage per soldier")
    cost_gold = models.PositiveIntegerField()
    cost_manpower = models.PositiveIntegerField(default=1)
    vision = models.FloatField(default=1.0, help_text="Relative scouting radius")
    pursuit = models.FloatField(
        default=0.0, help_text="Bonus damage vs routing enemies"
    )
    counters = models.JSONField(
        default=dict,
        blank=True,
        help_text='Damage multipliers vs other unit keys, e.g. {"knights": 2.0}',
    )
    color = models.CharField(max_length=9, default="#cccccc")
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "key"]

    def __str__(self) -> str:
        return self.name


class Commander(models.Model):
    key = models.SlugField(primary_key=True, max_length=40)
    faction = models.CharField(
        max_length=10, choices=Faction.choices, default=Faction.PLAYER
    )
    name = models.CharField(max_length=80)
    title = models.CharField(max_length=120)
    specialty = models.CharField(max_length=200)
    lore = models.TextField(blank=True)
    banner_color = models.CharField(max_length=9, default="#c9a227")
    sigil = models.CharField(
        max_length=24, default="crown", help_text="Icon name used in the UI"
    )
    # Multipliers per unit key, e.g. {"knights": 1.25}
    unit_bonuses = models.JSONField(default=dict, blank=True)
    speed_mod = models.FloatField(default=1.0)
    siege_mod = models.FloatField(default=1.0)
    defense_mod = models.FloatField(
        default=1.0, help_text="Multiplier on casualties taken (lower is better)"
    )
    morale_bonus = models.FloatField(default=0.0)
    vision_mod = models.FloatField(default=1.0)
    strengths = models.JSONField(
        default=list, blank=True, help_text="Short bullet points shown to the player"
    )
    weaknesses = models.JSONField(
        default=list, blank=True, help_text="Short bullet points shown to the player"
    )
    portrait = models.JSONField(
        default=dict,
        blank=True,
        help_text="Pixel portrait spec: skin, hair, hair_style, beard, headgear, armor, accent, eyes, scar, bg",
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["faction", "sort_order", "key"]

    def __str__(self) -> str:
        return f"{self.name}, {self.title}"


class Scenario(models.Model):
    """A playable map: castle placements, rivers, bridges and starting forces."""

    key = models.SlugField(primary_key=True, max_length=40)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    seed = models.PositiveIntegerField(default=1337)
    map_size = models.PositiveIntegerField(default=2400)
    definition = models.JSONField(
        help_text="Castles, terrain features and starting state"
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "key"]

    def __str__(self) -> str:
        return self.name


class Campaign(models.Model):
    """A saved playthrough. The full simulation snapshot is stored as JSON."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        VICTORY = "victory", "Victory"
        DEFEAT = "defeat", "Defeat"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Mode(models.TextChoices):
        CAMPAIGN = "campaign", "Campaign"
        ALLIANCE = "alliance", "Alliance War"
        SURVIVAL = "survival", "Survival"

    name = models.CharField(max_length=120)
    mode = models.CharField(max_length=10, choices=Mode.choices, default=Mode.CAMPAIGN)
    # Procedurally generated maps (alliance / survival) store their scenario inside `state`.
    scenario = models.ForeignKey(
        Scenario,
        on_delete=models.PROTECT,
        related_name="campaigns",
        null=True,
        blank=True,
    )
    seed = models.PositiveIntegerField(null=True, blank=True)
    difficulty = models.CharField(
        max_length=10,
        choices=[("easy", "Easy"), ("normal", "Normal"), ("hard", "Hard")],
        default="normal",
    )
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.ACTIVE
    )
    game_time = models.FloatField(default=0.0, help_text="Elapsed simulation seconds")
    state = models.JSONField(null=True, blank=True)
    summary = models.JSONField(
        default=dict, blank=True, help_text="Lightweight stats for list views"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return self.name


class BattleReport(models.Model):
    class Outcome(models.TextChoices):
        VICTORY = "victory", "Victory"
        DEFEAT = "defeat", "Defeat"
        RETREAT = "retreat", "Enemy retreated"
        WITHDREW = "withdrew", "We withdrew"
        CAPTURED = "captured", "Castle captured"
        LOST = "lost", "Castle lost"

    campaign = models.ForeignKey(
        Campaign, on_delete=models.CASCADE, related_name="battle_reports"
    )
    game_time = models.FloatField()
    location = models.CharField(max_length=120)
    kind = models.CharField(
        max_length=10, choices=[("field", "Field battle"), ("siege", "Siege")]
    )
    outcome = models.CharField(max_length=10, choices=Outcome.choices)
    player_force = models.CharField(max_length=120)
    enemy_force = models.CharField(max_length=120)
    player_losses = models.PositiveIntegerField(default=0)
    enemy_losses = models.PositiveIntegerField(default=0)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-game_time"]

    def __str__(self) -> str:
        return f"{self.location} ({self.get_outcome_display()})"
