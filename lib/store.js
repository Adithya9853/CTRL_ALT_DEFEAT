// Small JSON-file database. Every change is written to disk at once (write to a temp file, then rename),
// so a refresh or a server restart never loses saved data.
const fs = require("fs");
const path = require("path");

const EMPTY = { users: [], sessions: [], reports: [], claims: [], notifications: [] };

class Store {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      this.data = { ...EMPTY, ...JSON.parse(fs.readFileSync(file, "utf8")) };
    } else {
      this.data = JSON.parse(JSON.stringify(EMPTY));
      this.save();
    }
  }
  save() {
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = Store;
