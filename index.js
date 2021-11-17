import {repos} from "./snapshots/repos.js";
const {default: recent} = await import("./snapshots/recent.js");
const {default: month} = await import("./snapshots/month.js");
const {default: year} = await import("./snapshots/year.js");
const {default: alltime} = await import("./snapshots/alltime.js");

const primary = ["conda/conda", "conda/conda-build"];

// populate select
$(repos).each(function() {
    var option = $("<option/>");

    option.html(this.split("/")[1]);
    option.val(this);

    $("#repoSelection").append(option);
});

// select event
$("#repoSelection").on("change", function() {
    $(".overview").addClass("dim");

    setRepo(this.value);
});

// initialize repoLink & charts (on load)
$(document).ready(function() {
    setRepo($("#repoSelection").val());
});

async function setRepo(path) {
    // set repoLink
    setRepoLink(path);

    // update diff of recent changes
    setDiff(path, recent);

    // recent chart
    generateChart("hourChart", path, recent, "day");

    // month chart
    generateChart("monthChart", path, month, "day");

    // year chart
    generateChart("yearChart", path, year, "month");

    // all time chart
    generateChart("alltimeChart", path, alltime, "year");
}

// Anaconda colors, see branding
const colors = [
    // primary
    // "rgba(246, 233, 72, 0.4)",
    // "rgba(194, 213, 0, 0.5)",
    // "rgba(128, 88, 0, 0.5)",
    "rgba(67, 176, 63, 0.5)",

    // secondary: green-blues
    "rgba(26, 130, 65, 0.5)",
    "rgba(0, 106, 91, 0.5)",
    "rgba(0, 59, 74, 0.5)",
    "rgba(6, 38, 45, 0.5)",

    // ternary: blues
    "rgba(0, 161, 155, 0.5)",
    "rgba(0, 117, 169, 0.5)",
    "rgba(0, 55, 100, 0.5)",
    "rgba(18, 40, 76, 0.5)",
];
let colorIndex = 0, colorLength = colors.length;

function generateChart(bindto, path, snapshots, increment) {
    // clear the old chart
    $("#" + bindto).replaceWith('<canvas id="' + bindto + '" height="400px"></canvas>');

    // compile datasets
    let datasets = [], maxLength = 0, data;
    for (let p of (path ? [path] : primary)) {
        data = snapshots[p];
        maxLength = Math.max(maxLength, data.length);
        datasets.push({label: p, data: data, borderColor: colors[colorIndex++ % colorLength]});
    }

    // generate new chart
    const myChart = new Chart($("#" + bindto).get(0).getContext('2d'), {
        type: 'line',
        data: {
            labels: snapshots.timestamp.slice(0, maxLength),
            datasets: datasets
        },
        options: {
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: increment
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => {
                            if (Number.isInteger(value)) {
                                return value;
                            }
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                decimation: {
                    enabled: true
                },
                tooltip: {
                    callbacks: {
                        footer: (items) => {
                            if (items.length > 1) {
                                let sum = 0;
                                for (let i of items) {
                                    sum += i.parsed.y;
                                }
                                return 'Sum: ' + sum;
                            }
                        }
                    }
                }
            }
        }
    });
}

function setDiff(path, snapshots) {
    const states = {
        "+": {
            "color": "alert-danger",
            "icon": "#arrow-up-circle-fill",
            "adjective": "more"
        },
        "0": {
            "color": "alert-warning",
            "icon": "#dash-circle-fill",
            "adjective": "more"
        },
        "-": {
            "color": "alert-success",
            "icon": "#arrow-down-circle-fill",
            "adjective": "fewer"
        }
    };

    let current = 0, prior = 0, slice;
    for (let p of (path ? [path] : primary)) {
        slice = snapshots[p];
        if (slice) {
            current += slice[slice.length - 1];
            prior += slice[slice.length - 24];
        }
    }

    const diff = prior - current;

    let state;
    if (diff < 0) {
        state = states["-"];
    } else if (diff == 0) {
        state = states["0"];
    } else {
        state = states["+"];
    }

    $("#diff").addClass(state["color"]);
    $("#diff").html(`
        <svg class="bi flex-shrink-0 me-2" width="24" height="24" role="img" aria-label="Info:"><use xlink:href="${ state["icon"] }"/></svg>
        <div>
            ${ Math.abs(diff) } ${ state["adjective"] } issues in the past 24 hrs
        </div>
    `);
}

function getGridLines(firstTimestamp, lastTimestamp, increment) {
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
            .add(1, increment)
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
