const path = require("path");
const { hasHomePageNote } = require("../helpers/homePage");

const hasGardenHomePage = hasHomePageNote(path.join(__dirname, "notes"));

module.exports = {
  permalink: hasGardenHomePage ? false : "/",
};
