export const DEMO_SET = {
  names: ["Nikola Tesla"],
  texts: [`Call me Ishmael. Some years ago — never mind how long precisely — having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people's hats off — then, I account it high time to get to sea as soon as I can.`],
  dates: [{ label: "moon landing", iso: "1969-07-20" }],
  locations: ["Smiljan, Croatia", "Wardenclyffe, New York"],
  media: ["2001: A Space Odyssey"],
};

export const RANDOM_POOLS = {
  names: [
    "Nikola Tesla", "Marie Curie", "Ada Lovelace", "Hedy Lamarr",
    "Alan Turing", "Carl Sagan", "Mary Shelley", "Jorge Luis Borges",
    "Akira Kurosawa", "Frida Kahlo", "Hypatia", "Leonardo da Vinci",
    "Gertrude Stein", "Buckminster Fuller", "Octavia Butler",
    "Ramanujan", "Hokusai", "Sun Tzu",
  ],
  texts: [
    "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of light, it was the season of darkness.",
    "All happy families are alike; each unhappy family is unhappy in its own way.",
    "In a hole in the ground there lived a hobbit. Not a nasty, dirty, wet hole, filled with the ends of worms and an oozy smell, nor yet a dry, bare, sandy hole with nothing in it to sit down on or to eat: it was a hobbit-hole, and that means comfort.",
    "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.",
    "The past is a foreign country; they do things differently there.",
    "Many years later, as he faced the firing squad, Colonel Aureliano Buendía was to remember that distant afternoon when his father took him to discover ice.",
  ],
  dates: [
    { label: "moon landing", iso: "1969-07-20" },
    { label: "fall of the Berlin Wall", iso: "1989-11-09" },
    { label: "Tunguska event", iso: "1908-06-30" },
    { label: "Roswell incident", iso: "1947-07-08" },
    { label: "Challenger disaster", iso: "1986-01-28" },
    { label: "first ARPANET message", iso: "1969-10-29" },
    { label: "Krakatoa eruption", iso: "1883-08-27" },
  ],
  locations: [
    "Roswell, New Mexico", "Stonehenge, UK", "Easter Island",
    "Bermuda Triangle", "Area 51", "Smiljan, Croatia",
    "Tunguska, Russia", "Nazca, Peru", "Giza, Egypt",
    "Bran Castle, Romania", "Dealey Plaza, Dallas",
    "Wardenclyffe, New York", "Marfa, Texas",
  ],
  books: [
    "Foucault's Pendulum", "Gravity's Rainbow", "House of Leaves",
    "The Crying of Lot 49", "1984", "The Master and Margarita",
    "Cosmos", "The Illuminatus! Trilogy",
  ],
  // Lean toward paranoid-thriller titles — fits the investigator's vibe
  // better than rom-coms. These are the titles ambiguous-disambiguation
  // bias was built for: each has a famous film/TV interpretation that
  // Wikipedia would otherwise bury under a pronoun or place name.
  media: [
    "Twin Peaks", "The X-Files", "Vertigo", "The Conversation",
    "All the President's Men", "Three Days of the Condor",
    "JFK", "The Manchurian Candidate", "The Parallax View",
    "Network", "Dr. Strangelove", "Blow Out", "Klute",
    "The Prisoner", "Person of Interest", "Mr. Robot",
  ],
};

export const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
