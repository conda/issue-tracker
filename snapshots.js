import fetch from "node-fetch";
import moment from "moment";
import fs from "fs";
import core from "@actions/core";
import {repos} from "./snapshots/repos.js";

// process.argv[0]  // node
// process.argv[1]  // snapshots.js
// process.argv[2]  // PREFIX
// process.argv[3]  // trim
const prefix = process.argv[2];
if (!prefix) {
    core.error(`Expected PREFIX`);
    process.exit(1);
}
const trim = parseInt(process.argv[3]);

query(prefix, trim);

function getIssues(repo, state) {
    let [org, prj] = repo.split("/");
    const url = "https://api.github.com/graphql";
    const options = {
        method: "POST",
        body: JSON.stringify({
            query: `
                query {
                    repository(owner: "${ org }", name:"${ prj }") {
                        issues(states:${ state }) {
                            totalCount
                        }
                    }
                }
            `
        }),
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `bearer ${ process.env.GITHUB_TOKEN }`
        }
    };

    return fetch(url, options)
        .then(resp => resp.json())
        .then(data => {
            return data.data.repository.issues.totalCount;
        });
}

function writeSnapshot(path, prefix, snapshots) {
    // read in old data, if successful append new entry and write it out again
    try {
        fs.writeFileSync(path, `const ${ prefix } = ${ JSON.stringify(snapshots) }\nexport default ${ prefix };\n`);
    } catch (err) {
        core.error(`Error writing file: ${ err }`);
        process.exit(1);
    }

    core.notice(`${ snapshots.timestamp.length } snapshots successfully written!`);
}

const trimmed = (s, t) => t ? s.slice(-t) : s;

async function query(prefix, trim) {
    const path = `./snapshots/${ prefix }.js`;
    const {default: snapshots} = await import(path);

    let n;
    for (let repo of repos) {
        n = await getIssues(repo, "OPEN");

        if (repo in snapshots) {
            // if we were already tracking this we will continue to track it even if there are zero open issues
            snapshots[repo] = trimmed([n, ...snapshots[repo]], trim);
        } else if (n) {
            // if untracked we will only start tracking it if there are 1+ open issues
            snapshots[repo] = trimmed([n], trim);
        }
    }
    snapshots.timestamp = trimmed([moment().startOf("hour").valueOf(), ...snapshots.timestamp], trim);

    writeSnapshot(path, prefix, snapshots, trim);
}
