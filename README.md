# Sun-Powered Sonography

A guided, static planning prototype for solar and battery power at ultrasound services. Four screens cover location, service/equipment, power plan and results. Technical readings, methods and sources expand when needed. It combines cited equipment and location references with inputs from the operator's readings and selected equipment datasheets.

The page estimates operating energy, a solar energy target and a battery backup target. Unknown inputs remain blank and dependent results are withheld. Modelled solar yield is a city-point reference, not a measurement of a particular roof.

**Release scope:** automatic electricity/fuel savings, carbon savings and payback are not calculated. Monthly energy totals do not establish when solar energy is available, whether the selected battery can shift it, or whether the baseline and proposed service are equivalent. An installed quote is displayed only as an operator-entered budget. X-ray supply and battery discharge checks remain screening checks, with phase, starting-current and exposure-duration limitations stated.

OCH Alephata is a proposed pilot under renovation. There are no measured pilot outcomes in this release. The intended evaluation records energy, fuel, service interruptions and patient waiting after opening.

## Run locally

Open `index.html`, or run:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. The page has no backend or runtime data API. Its optional Google Fonts stylesheet falls back to system fonts.

Reference datasets used by the page are in `data/`; their rows include source URLs and scope notes. Calculation details are in [METHOD.md](METHOD.md). Targeted release checks are in `checks/`.

## Currency

US installed quotes use USD. Indian installed quotes use INR and show an approximate USD reference where a valid dated rate is available. The bundled reference is INR95.81 per US dollar, observed 25 September 2026 in the Federal Reserve H.10 release of 28 September 2026. This is a dated presentation reference, not a current transaction rate. Editing its rate or date clears source attribution. The exact reference and dates are preserved in [data/fx_reference.json](data/fx_reference.json).

This is a screening prototype. Metered loads, a site survey, hourly modelling and qualified electrical design are needed before selecting or purchasing a system.
