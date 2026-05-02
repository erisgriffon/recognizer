// Investigator Mode presets. One knob that sets all four depth categories
// (numerology, astrology, lexical, geographic) at once. Individual depth
// controls remain available for users who want to mix — when a mixed
// configuration is active, detectPreset returns "custom" and the dropdown
// surfaces that to the user.
//
// The preset is *derived*, not stored. Storing it would let the preset
// disagree with the actual depths after an individual control change;
// computing it from the depths means the two cannot drift.

export const INVESTIGATOR_PRESETS = {
  skeptic: {
    label: "Skeptic",
    description: "The investigator considers only the most rigorous numeric coincidences.",
    depths: { numerologyDepth: 0, astrologyDepth: 0, lexicalDepth: 0, geographicDepth: 0 },
  },
  standard: {
    label: "Standard",
    description: "Default investigative methods. Numerology, astrology, lexical analysis, and geographic patterns at moderate depth.",
    depths: { numerologyDepth: 1, astrologyDepth: 1, lexicalDepth: 1, geographicDepth: 1 },
  },
  believer: {
    label: "Believer",
    description: "Adds Chaldean numerology, astrological modality and rulers, phonetic name matching, and antipodal geography.",
    depths: { numerologyDepth: 2, astrologyDepth: 2, lexicalDepth: 2, geographicDepth: 2 },
  },
  conspiracy: {
    label: "Conspiracy",
    description: "Maximum investigative depth. The investigator's hands are trembling.",
    depths: { numerologyDepth: 3, astrologyDepth: 3, lexicalDepth: 3, geographicDepth: 3 },
  },
};

// Order matters for UI rendering — presets appear in this order in the
// dropdown, with "custom" appended only when the current depths match no
// named preset.
export const PRESET_ORDER = ["skeptic", "standard", "believer", "conspiracy"];

// Returns the preset key matching the four depth values on `settings`, or
// "custom" if no preset matches. Treats missing depth values as 1 (the
// default), so a partial settings object that's been migrated forward still
// returns "standard" rather than "custom".
export const detectPreset = (settings) => {
  const depths = [
    settings.numerologyDepth ?? 1,
    settings.astrologyDepth ?? 1,
    settings.lexicalDepth ?? 1,
    settings.geographicDepth ?? 1,
  ];
  for (const key of PRESET_ORDER) {
    const target = INVESTIGATOR_PRESETS[key].depths;
    if (
      depths[0] === target.numerologyDepth &&
      depths[1] === target.astrologyDepth &&
      depths[2] === target.lexicalDepth &&
      depths[3] === target.geographicDepth
    ) return key;
  }
  return "custom";
};
