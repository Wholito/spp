const fs = require('fs');
const path = require('path');

const createStore = (file) => {
  const load = () => {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!data || !Array.isArray(data.rooms)) return { rooms: [] };
      return data;
    } catch (err) {
      if (err.code === 'ENOENT') return { rooms: [] };
      throw err;
    }
  };

  const save = (data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    try {
      if (fs.existsSync(file)) fs.rmSync(file);
      fs.renameSync(tmp, file);
    } catch (err) {
      fs.copyFileSync(tmp, file);
      fs.unlinkSync(tmp);
    }
  };

  return { load, save };
};

module.exports = { createStore };
