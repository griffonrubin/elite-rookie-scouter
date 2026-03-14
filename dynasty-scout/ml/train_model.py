import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
import joblib
from scrapers import config
import logging

logger = logging.getLogger("ModelTrainer")

def train_model():
    """
    Trains a Random Forest model to predict Fantasy Points per Game (PPG) 
    based on college stats and measurables.
    """
    logger.info("Loading Historical Data...")
    
    # Mock Data for Training (since we don't have a populated historical DB yet)
    # In real app: Fetch from players + college_stats + measurables tables where draft_year < 2026
    
    data = pd.DataFrame({
        'dominator_rating': np.random.uniform(0.1, 0.5, 100),
        'breakout_age': np.random.uniform(18, 23, 100),
        'draft_capital': np.random.randint(1, 260, 100),
        'speed_score': np.random.uniform(80, 120, 100),
        'bmi': np.random.uniform(25, 35, 100),
        'fantasy_ppg_yr1': np.random.uniform(0, 20, 100) # Target
    })
    
    features = ['dominator_rating', 'breakout_age', 'draft_capital', 'speed_score', 'bmi']
    target = 'fantasy_ppg_yr1'
    
    X = data[features]
    y = data[target]
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    logger.info("Training Random Forest...")
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    
    # Eval
    preds = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds)
    logger.info(f"Model MAE: {mae:.2f}")
    
    # Save
    joblib.dump(model, 'ml/prospect_model_v1.pkl')
    logger.info("Model saved to ml/prospect_model_v1.pkl")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    train_model()
