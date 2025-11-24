# train_model.py
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline
import joblib
import os
import json
from datetime import datetime

DATA_FILENAME = '50_Startups.csv'
LEGACY_DATA = 'startup_data.csv'
MODEL_PATH = 'model.pkl'

def find_dataset(filename=DATA_FILENAME, max_up=6):
    """Search upward from this file's directory for `filename` up to `max_up` levels."""
    here = os.path.dirname(__file__)
    cur = here
    for _ in range(max_up):
        candidate = os.path.join(cur, filename)
        if os.path.exists(candidate):
            return candidate
        cur = os.path.dirname(cur)
        if cur == '' or cur == os.path.dirname(cur):
            break
    return None

def load_data(path=None):
    if path is None:
        # try to find preferred dataset
        found = find_dataset()
        if found:
            path = found
        elif os.path.exists(LEGACY_DATA):
            path = LEGACY_DATA
        else:
            raise FileNotFoundError(f"Neither {DATA_FILENAME} nor {LEGACY_DATA} were found.")

    df = pd.read_csv(path)
    # normalize column names
    df.columns = [c.strip() for c in df.columns]
    return df

def train_and_save():
    df = load_data()
    X = df[['R&D Spend','Administration','Marketing Spend','State']]
    y = df['Profit']

    # feature transformer: numeric scale, state one-hot
    numeric_features = ['R&D Spend','Administration','Marketing Spend']
    categorical_features = ['State']

    preprocessor = ColumnTransformer(transformers=[
        ('num', StandardScaler(), numeric_features),
        ('cat', OneHotEncoder(handle_unknown='ignore'), categorical_features)
    ])

    pipeline = Pipeline([
        ('pre', preprocessor),
        ('model', RandomForestRegressor(n_estimators=200, random_state=42))
    ])

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.12, random_state=42)
    pipeline.fit(X_train, y_train)
    print("Train R^2:", pipeline.score(X_train, y_train))
    print("Test R^2:", pipeline.score(X_test, y_test))

    # save model
    joblib.dump(pipeline, MODEL_PATH)
    print(f"Model saved to {MODEL_PATH}")

    # compute simple feature importances aggregated for categorical
    try:
        rf = pipeline.named_steps['model']
        pre = pipeline.named_steps['pre']
        # feature names: numeric + onehot categories
        numeric_features = ['R&D Spend','Administration','Marketing Spend']
        cat = pre.named_transformers_['cat']
        try:
            cat_cols = list(cat.get_feature_names_out(['State']))
        except Exception:
            # fallback name
            cat_cols = ['State_' + str(i) for i in range(len(cat.categories_[0]))]

        feature_names = numeric_features + cat_cols
        importances = list(rf.feature_importances_)

        # aggregate one-hot importances back into 'State'
        state_importance = 0.0
        for i, name in enumerate(feature_names):
            if name.startswith('State'):
                state_importance += importances[i]

        agg_importances = {
            'R&D Spend': importances[0] if len(importances) > 0 else 0.0,
            'Administration': importances[1] if len(importances) > 1 else 0.0,
            'Marketing Spend': importances[2] if len(importances) > 2 else 0.0,
            'State': state_importance
        }
    except Exception as e:
        print('Could not compute importances:', e)
        agg_importances = {}

    meta = {
        'trained_on': os.path.abspath(find_dataset() or LEGACY_DATA),
        'train_r2': float(pipeline.score(X_train, y_train)),
        'test_r2': float(pipeline.score(X_test, y_test)),
        'trained_at': datetime.utcnow().isoformat() + 'Z',
        'importances': agg_importances
    }

    try:
        with open('model_meta.json', 'w') as f:
            json.dump(meta, f)
            print('Saved model metadata to model_meta.json')
    except Exception as e:
        print('Failed to save model metadata:', e)

if __name__ == '__main__':
    try:
        dataset = find_dataset()
        if dataset:
            print("Found dataset:", dataset)
        elif os.path.exists(LEGACY_DATA):
            dataset = LEGACY_DATA
            print("Using legacy dataset:", dataset)
        else:
            raise FileNotFoundError(f"Neither {DATA_FILENAME} nor {LEGACY_DATA} were found.")

        train_and_save()
    except Exception as e:
        print("Error:", e)
