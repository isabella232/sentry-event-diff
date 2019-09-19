const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const uaParser = require("ua-parser-js");
const jsonDiff = require("json-diff");
const clc = require("cli-color");
const app = express();
const port = 3000;

/**
 * BOOTSTRAP
 **/

app.use(cors());
app.use(
  bodyParser.text({
    size: "200kb"
  })
);
app.post("/api/:projectId/store", snapshotHandler);

app.listen(port, () =>
  console.log(`\nSentry Event Diffing Service listening on port ${port}\n`)
);

/**
 * ACTUAL WORK
 **/

const eventNameRegexp = /_BEGIN_([a-zA-Z\-]+)_END_/;
const snapshotsDirectory = path.join(__dirname, "__snapshots__/");

function snapshotHandler(req, res) {
  let event;
  try {
    event = JSON.parse(req.body);
  } catch (e) {
    console.log("Malformed event");
    return res.sendStatus(400);
  }

  let name;
  try {
    [_, name] = eventNameRegexp.exec(req.body);
  } catch (e) {
    console.log("Unidentifiable event");
    return res.sendStatus(400);
  }

  const ua = uaParser(req.headers["user-agent"]);
  const sdk = {
    name: event.sdk.name,
    version: event.sdk.version
  };
  const snapshot = { ua, sdk, name, event };
  const snapshotFilename = getSnapshotFilename(snapshot);
  const snapshotPath = path.join(snapshotsDirectory, snapshotFilename);

  if (fs.existsSync(snapshotPath)) {
    console.log(clc.blue(`Snapshot Found: ${snapshotFilename}`));
    const content = JSON.parse(fs.readFileSync(snapshotPath));
    const diff = jsonDiff.diffString(content.event, event);
    if (!diff) {
      console.log(clc.green("✓ Snapshot Match\n"));
    } else {
      console.log(clc.red("𝗫 Snapshot Mismatch"));
      console.log(diff);
    }
  } else {
    console.log(clc.yellow(`New Snapshot: ${snapshotFilename}`));
    storeSnapshot(snapshot, snapshotPath);
  }

  res.sendStatus(200);
}

function getSnapshotFilename(snapshot) {
  return `${snapshot.sdk.name}-${snapshot.sdk.version}-${
    snapshot.ua.browser.name
  }-${snapshot.ua.browser.major || snapshot.browser.version}-${
    snapshot.name
  }.json`;
}

function storeSnapshot(snapshot, snapshotPath) {
  if (!fs.existsSync(snapshotsDirectory)) {
    fs.mkdirSync(snapshotsDirectory);
  }

  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
}