import {repos} from "./repos.js";
import {snapshots} from "./snapshots.js";

// populate select
$(repos).each(function() {
    var option = $("<option/>");

    option.html(this.split("/")[1]);
    option.val(this);

    $("#repoSelection").append(option);
});

// select event
$("#repoSelection").on("change", function() { setRepo(this.value); });

// initialize repoLink & charts (on load)
$(document).ready(function() {
    setRepo($("#repoSelection").val());
});

function setRepo(path) {
    // set repoLink
    setRepoLink(path);

    // update diff
    console.log(snapshots);
    setDiff(path, snapshots[0], snapshots[23]);

    // update charts
    const threeDaysAgoUnix = moment
        .unix(snapshots[0].timestamp)
        .subtract(3, "days")
        .unix();
    generateChart(
        "#hourChart",
        path,
        snapshots
            .slice(-72, -1)
            .filter(snapshot => snapshot.timestamp > threeDaysAgoUnix)
    );
    const monthAgoUnix = moment
        .unix(snapshots[0].timestamp)
        .subtract(1, "month")
        .unix();
    generateChart(
        "#monthChart",
        path,
        snapshots
            .slice(-720, -1)
            .filter(snapshot => snapshot.timestamp > monthAgoUnix)
            .filter((_, idx) => idx % 4 === 0)
    );
}

function countOpen(path, snapshot) {
    let open = 0;
    for (let repo of (path ? [path] : repos)) {
        open += snapshot[repo]["open"];
    }
    return open;
}

function generateChart(bindto, path, snapshots) {
    // unpack array
    let timestamps = [];
    let openIssues = [];

    for (let snapshot of snapshots) {
        timestamps.push(snapshot["timestamp"]);
        openIssues.push(countOpen(path, snapshot));
    }

    console.log(timestamps);
    console.log(openIssues);

    // generate C3 chart
    c3.generate({
        bindto: bindto,
        data: {
            x: "x",
            columns: [["x", ...timestamps], ["open issues", ...openIssues]]
        },
        axis: {
            y: {
                tick: {
                    format: function(x) {
                        return x === Math.floor(x) ? x : "";
                    }
                }
            },
            x: {
                tick: {
                    format: function(d) {
                        return moment.unix(d).format("llll");
                    }
                }
            }
        },
        grid: {
            x: {
                lines: getGridLines(timestamps[0], timestamps[timestamps.length - 1])
            }
        },
        tooltip: {
            format: {
                title: function(d) {
                    return moment.unix(d).format("llll");
                }
            }
        },
        subchart: { show: true },
        size: { height: 400 }
    });
}

function setDiff(path, currentSnapshot, dayAgoSnapshot) {
    const states = {
        "true": {
            "color": "alert-danger",
            "icon": "#arrow-up-circle-fill",
            "adjective": "more"
        },
        "false": {
            "color": "alert-success",
            "icon": "#arrow-down-circle-fill",
            "adjective": "fewer"
        }
    };

    console.log(path);
    console.log(currentSnapshot);
    console.log(dayAgoSnapshot);
    let diff = countOpen(path, currentSnapshot) - countOpen(path, dayAgoSnapshot);
    let state = states[diff > 0];

    $("#diff").addClass(state["color"]);
    $("#diff").html(`
        <svg class="bi flex-shrink-0 me-2" width="24" height="24" role="img" aria-label="Info:"><use xlink:href="${state["icon"]}"/></svg>
        <div>
            ${Math.abs(diff)} ${state["adjective"]} issues compared to a day ago
            (${dayAgoSnapshot.openIssues} to ${currentSnapshot.openIssues})
        </div>
    `);
}

function getGridLines(firstTimestamp, lastTimestamp) {
    const gridlines = [];

    let firstDay = moment
        .unix(firstTimestamp)
        .add(1, "days")
        .startOf("day");
    let numOfDays = moment
        .unix(lastTimestamp)
        .startOf("day")
        .diff(firstDay, "days");
    for (let i = 0; i < numOfDays + 1; i++) {
        gridlines.push({
            value: firstDay.unix(),
            text: firstDay.format("ddd, MMMM Do")
        });

        firstDay = firstDay
            .add(1, "day")
            .startOf("day");
    }

    return gridlines;
}

function setRepoLink(path) {
    if (path) {
        $("#repoLink").attr("href", "https://github.com/" + path);
        $("#repoLink").addClass("btn-dark");
        $("#repoLink").removeAttr("aria-disabled");
        $("#repoLink").removeAttr("tabindex");
        $("#repoLink").removeClass("disabled btn-outline-dark");
    } else {
        $("#repoLink").addClass("disabled btn-outline-dark");
        $("#repoLink").attr("aria-disabled", "true");
        $("#repoLink").attr("tabindex", "-1");
        $("#repoLink").removeClass("btn-dark");
    }
}
