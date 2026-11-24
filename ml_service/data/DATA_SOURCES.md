# Agricultural Data Sources

## Crop suitability dataset

- **Dataset:** Crop Recommendation Dataset
- **Kaggle source:** https://www.kaggle.com/datasets/atharvaingle/crop-recommendation-dataset
- **License reported by Kaggle:** Apache 2.0
- **File:** `ml_service/data/crop/Crop_recommendation.csv`
- **Downloaded locally:** 2,200 rows
- **Features:** `N`, `P`, `K`, `temperature`, `humidity`, `ph`, `rainfall`
- **Target:** `label`
- **Class count:** 22 crop classes, 100 rows per class in the distributed file
- **Dataset description:** The publisher states that the dataset augments rainfall, climate and fertilizer data available for India.

### Feature limitations

- Values are historical/tabular observations, not live field measurements.
- A soil result without location and season is not an on-farm guarantee.
- The rainfall, temperature and humidity fields must be interpreted consistently with the dataset definitions.
- The published dataset does not document every original source row or a formal peer-reviewed agronomic process.
- Soil type and soil organic carbon are not present in this dataset.

### Reproduction

Download the public Kaggle dataset and extract `Crop_recommendation.csv` here:

```powershell
Invoke-WebRequest `
  -Uri "https://www.kaggle.com/api/v1/datasets/download/atharvaingle/crop-recommendation-dataset" `
  -OutFile ml_service/data/crop/crop.zip
Expand-Archive -Path ml_service/data/crop/crop.zip -DestinationPath ml_service/data/crop -Force
```

## Weather data

- **Service:** Open-Meteo Forecast API
- **URL:** https://open-meteo.com/
- **Disease scan integration:** `backend/services/weatherService.js`; it requests live daily temperature, weather code, and precipitation only when farmer location is available. Results include the provider timezone and fetch timestamp; missing location or provider failure is explicitly returned as unavailable with no synthetic forecast or default coordinates.
- **Irrigation integration:** `backend/services/agricultureWeatherService.js`; it requests current conditions and daily precipitation, temperature, wind and FAO reference ET0 for three days.
- **Limitations:** forecast accuracy varies by location and lead time. Open-Meteo terms, attribution requirements and availability should be reviewed for production use.

## Disease dataset

- **Dataset:** PlantVillage color leaf images
- **Pinned source:** https://huggingface.co/datasets/mohanty/PlantVillage at revision `9e97599868962bd0079b8db4b7f1efa9185fa1e7`
- **License declared by the dataset card:** CC BY-SA 3.0. Review attribution and share-alike obligations before redistributing the dataset, model weights, or derivative works.
- **Contents:** 54,305 listed color images across 38 classes, including healthy classes. The downloaded manifests and evaluation report are authoritative for the local data counts.
- **Split audit:** Filename-derived leaf IDs are heuristic. SHA-256 identified 14 duplicate records within the published train manifest, 2 within the published test manifest, 5 exact-content hashes crossing the source manifests, and 8 across the prior grouped training pool/test partition. Six exact duplicate/repeated test records overlapping model-fit, validation, or test data were excluded from the corrected score. Future training joins and deduplicates exact-image hashes before group splitting.
- **Limitations:** Hashes detect exact-byte copies only and do not prove biological leaf independence or detect resized/recompressed variants. PlantVillage images use controlled backgrounds; held-out metrics remain same-source dataset-level results, not external-source or field-photo validation. No independent disease-image source is present in the project.

## Generated local data and models

The downloaded crop CSV/archive, PlantVillage images/archive, and trained `.joblib`/`.keras` weights are generated or downloaded locally and excluded from Git. Small source manifests, model cards, evaluation reports and confusion-matrix images may be retained for reproducibility; do not commit large datasets or model binaries without reviewing size and license obligations.

## Treatment references

Treatment and prevention information must be reviewed against authoritative local agricultural guidance. This repository must not present dosage or pesticide mixing instructions without a current, jurisdiction-specific extension source.
