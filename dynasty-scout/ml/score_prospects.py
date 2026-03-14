import pandas as pd
import joblib
from scrapers import config
import logging
import os

logger = logging.getLogger("ProspectScorer")

class ProspectScorer:
    def __init__(self):
        try:
            self.conn = config.get_db_connection()
            self.cursor = config.get_db_cursor(self.conn)
        except Exception:
            logger.warning("Database not available. Using Mock Mode.")
            self.conn = None
            self.cursor = None
        
        model_path = 'ml/prospect_model_v1.pkl'
        if os.path.exists(model_path):
            self.model = joblib.load(model_path)
        else:
            logger.warning("Model not found. Run train_model.py first.")
            self.model = None

    def get_prospects(self):
        if not self.cursor:
            # Mock Data
            return pd.DataFrame({
                'id': [1, 2],
                'full_name': ['Jeremiah Love', 'Arch Manning'],
                'dominator_rating': [0.35, 0.28],
                'breakout_age': [19.5, 20.0],
                'draft_capital': [50, 5],
                'speed_score': [108.5, 95.0],
                'bmi': [29.5, 28.0]
            })

        # Fetch 2026 prospects with necessary features
        # ... SQL query ...
        return []

    def score(self):
        if not self.model:
            return

        logger.info("Scoring 2026 Prospects...")
        prospects = self.get_prospects()
        
        if prospects.empty:
            logger.warning("No prospects found.")
            return

        features = ['dominator_rating', 'breakout_age', 'draft_capital', 'speed_score', 'bmi']
        
        # Predict
        try:
            X = prospects[features]
            preds = self.model.predict(X)
            
            prospects['predicted_ppg'] = preds
            # Normalize to 0-100 score (simple min-max for demo)
            prospects['score'] = (preds / 25.0) * 100 
            
            logger.info("\n" + str(prospects[['full_name', 'predicted_ppg', 'score']]))
            
            # Save back to DB if conn exists
            if self.conn:
                # ... upsert ...
                pass
        except Exception as e:
            logger.error(f"Scoring failed: {e}")
            
        logger.info("Scoring Complete.")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    scorer = ProspectScorer()
    scorer.score()
