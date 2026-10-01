# Calculation scope

All centre-specific hours, throughput, connected loads, backup goals and equipment selections are operator inputs. A published measurement describes the study configuration, rather than establishing the draw of every scanner with the same model name. Rated power is kept distinct from measured operation; a user-selected nameplate calculation is explicitly an upper bound.

## Load

For each scanner, scanning hours per machine equal total scans per open day multiplied by minutes per scan, divided by 60 and by machine quantity. Idle hours fill the remaining opening hours. The tool warns when entered throughput exceeds the schedule. Each state's watts multiplied by its hours gives Wh; division by 1,000 gives kWh.

Cooling energy comes from an entered daily reading. Its rated electrical input is used for a peak running-power screen, not as an average cooling load. Other equipment uses entered or cited watts and explicit hours. X-ray daily energy is a separate metered input; generator output and mains kVA are not converted into daily kWh.

Annual energy uses days open per week divided by seven, multiplied by 365. Closed-day energy includes equipment explicitly left on. This is a schedule-based annual estimate, not an hourly operating log.

## Solar

The 47 city-point monthly PVGIS records cover 21 countries, including 13 US cities. Each query models a 1 kWp system with 14% system losses. These losses are already included in PVOUT and are not applied a second time.

The grid-optional energy target equals annual load divided by annual modelled yield. The off-grid energy target uses the largest monthly load-to-yield ratio. The displayed target excludes additional storage losses. When a valid round-trip efficiency is entered, the page also shows an upper energy target assuming all energy passes through the battery.

Neither target establishes hourly availability, roof capacity, outage survival or actual on-site solar consumption. The monthly chart shows production and demand totals; surplus in one month does not cover a later month.

## Battery and supply

The grid-optional usable-energy target equals requested backup hours multiplied by average open-hours kW. The off-grid target equals requested days of autonomy multiplied by daily kWh. Nominal energy additionally needs the entered usable depth of discharge and inverter efficiency.

Complete module sizing also needs module nominal energy, continuous DC discharge power and known connected-load supply requirements. Sustained X-ray input kVA is treated at power factor one as a conservative DC power bound, rather than relabelled as measured draw. Momentary X-ray exposures require a separate BMS, phase and overload-duration check.

Simple numerical inverter comparisons do not establish electrical compatibility. The tool does not choose a certified system or verify manufacturer interoperability.

## Budget, carbon and outcomes

The displayed installed budget is an operator-entered quote. No automatic savings, payback, avoided grid electricity, avoided fuel or avoided CO2 is calculated in this release. Those comparisons need a validated time-of-use and battery-dispatch model, applicable financial inputs and a matched-service baseline.

US quotes are denominated in USD. For India, the same quote is displayed in INR with an approximate USD equivalent: INR divided by the entered INR-per-USD rate. The bundled Federal Reserve H.10 reference is 95.81 INR/USD, observed 25 September 2026 and released 28 September 2026. It is historical and indicative, not an executable transaction rate. A valid positive rate, dated observation and nonnegative quote are required. Operator changes clear numerical source attribution; country changes clear the quote to avoid relabelling an old amount in another currency.

Published grid factors remain source references with their dates and scopes. India's operational CO2 factor is kept distinct from lifecycle CO2e factors. No full lifecycle calculation is provided.

The proposed OCH pilot will establish its baseline after renovation and test energy, fuel, interruptions and waiting outcomes. All current planning calculations are prospective.
