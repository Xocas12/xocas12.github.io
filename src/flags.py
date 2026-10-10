"""International Code of Signals flags as inline SVG, for spelling words on the site."""
R, Y, B, W, K = "#D52B1E", "#FFC400", "#0A3B8C", "#FFFFFF", "#111111"

# Each flag is drawn on a 30x30 square (A on a swallowtail). Meanings are the ICS single-letter signals.
FLAGS = {
    "A": ("Alfa", "I have a diver down; keep well clear at slow speed.",
          f'<path d="M0 0H15V30H0Z" fill="{W}"/><path d="M15 0H30L22 15L30 30H15Z" fill="{B}"/>'),
    "C": ("Charlie", "Affirmative.",
          "".join(f'<rect y="{i * 6}" width="30" height="6" fill="{c}"/>' for i, c in enumerate([B, W, R, W, B]))),
    "E": ("Echo", "I am altering my course to starboard.",
          f'<rect width="30" height="15" fill="{B}"/><rect y="15" width="30" height="15" fill="{R}"/>'),
    "H": ("Hotel", "I have a pilot on board.",
          f'<rect width="15" height="30" fill="{W}"/><rect x="15" width="15" height="30" fill="{R}"/>'),
    "J": ("Juliett", "I am on fire and have dangerous cargo on board: keep well clear of me.",
          f'<rect width="30" height="30" fill="{B}"/><rect y="10" width="30" height="10" fill="{W}"/>'),
    "O": ("Oscar", "Man overboard.",
          f'<path d="M0 0H30V30Z" fill="{R}"/><path d="M0 0V30H30Z" fill="{Y}"/>'),
    "P": ("Papa", "All persons should report on board as the vessel is about to proceed to sea.",
          f'<rect width="30" height="30" fill="{B}"/><rect x="10" y="10" width="10" height="10" fill="{W}"/>'),
    "R": ("Romeo", "No meaning on its own.",
          f'<rect width="30" height="30" fill="{R}"/><rect x="12" width="6" height="30" fill="{Y}"/><rect y="12" width="30" height="6" fill="{Y}"/>'),
    "S": ("Sierra", "I am operating astern propulsion.",
          f'<rect width="30" height="30" fill="{W}"/><rect x="10" y="10" width="10" height="10" fill="{B}"/>'),
    "T": ("Tango", "Keep clear of me; I am engaged in pair trawling.",
          f'<rect width="10" height="30" fill="{R}"/><rect x="10" width="10" height="30" fill="{W}"/><rect x="20" width="10" height="30" fill="{B}"/>'),
    "V": ("Victor", "I require assistance.",
          f'<rect width="30" height="30" fill="{W}"/><path d="M0 0L30 30M30 0L0 30" stroke="{R}" stroke-width="6"/>'),
    "X": ("X-ray", "Stop carrying out your intentions and watch for my signals.",
          f'<rect width="30" height="30" fill="{W}"/><rect x="12" width="6" height="30" fill="{B}"/><rect y="12" width="30" height="6" fill="{B}"/>'),
}


def flag(letter, interactive=False):
    name, meaning, body = FLAGS[letter]
    outline = f'<path d="{"M0.5 0.5H29.5L21.6 15L29.5 29.5H0.5Z" if letter == "A" else "M0.5 0.5H29.5V29.5H0.5Z"}" fill="none" stroke="{K}" stroke-opacity=".25"/>'
    attrs = f' tabindex="0" data-letter="{letter} ({name})" data-meaning="{meaning}"' if interactive else ""
    return (f'<svg class="flag" viewBox="0 0 30 30" role="img" aria-label="{letter}, {name}"{attrs}>'
            f"<title>{letter}, {name}</title>{body}{outline}</svg>")


def word(text, interactive=False):
    return "".join(flag(c, interactive) for c in text.upper() if c in FLAGS)
