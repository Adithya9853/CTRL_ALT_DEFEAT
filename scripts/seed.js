// Adds clearly labelled sample reports so the demo isn't empty.
// Run: npm run seed        (remove them: npm run seed -- --remove)
const path = require("path");
const Store = require("../lib/store");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const db = new Store(path.join(DATA_DIR, "db.json"));

db.data.reports = db.data.reports.filter(r => !r.sample);
if (process.argv.includes("--remove")) { db.save(); console.log("Sample reports removed."); process.exit(0); }

const day = n => { const d = new Date(); d.setDate(d.getDate() - n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const S = (n, type, title, cat, color, desc, loc, ago, hidden) => ({
  id: "sample_" + n, type, title, cat, color, desc, loc, date: day(ago), hidden, photo: "",
  status: type === "lost" ? "Open" : "At Security Desk", created: Date.now() - ago * 86400000 - n * 60000,
  by: "samples", sample: true, ai: null, aiStatus: ""
});
db.data.reports.push(
  S(1, "lost", "boAt Airdopes black earbuds", "Earphones", "Black", "Black wireless earbuds in a black case with a small sticker on the lid", "Library", 1, "Initials RS scratched inside the case lid"),
  S(2, "found", "Wireless earphones with sticker", "Earphones", "Black", "Black earbuds case found on 2nd floor reading table, has a sticker", "Library", 0, "Letters RS scratched inside the lid; left bud has a dent"),
  S(3, "lost", "Blue Milton steel bottle", "Bottle", "Blue", "1 litre blue steel flask with a dent on the cap", "Canteen", 2, "Name Priya written in marker under the bottle"),
  S(4, "found", "Blue water bottle", "Bottle", "Blue", "Blue thermos-type sipper left near the juice counter, cap slightly dented", "Juice Stall", 1, "A name is written in marker under the bottle"),
  S(5, "lost", "Black Casio calculator", "Calculator", "Black", "fx-991 scientific calculator, lost after the maths internal", "CSE Block", 4, "Battery cover is missing"),
  S(6, "found", "Casio fx-991ES calculator", "Calculator", "Grey", "Grey Casio scientific calculator left on a bench", "Seminar Hall", 3, "Initials AR scratched on the back"),
  S(7, "found", "Grey hoodie", "Clothing", "Grey", "Grey sweatshirt left on the bench after football practice", "Ground", 1, "Size M, small ink stain on the left sleeve"),
  S(8, "lost", "HP laptop charger", "Laptop / Charger", "Black", "65W HP adapter with blue tape on the cable", "Labs", 2, "Sticker with roll number on the brick")
);
db.save();
console.log("Added 8 sample reports (tagged 'Sample' in the app).");
