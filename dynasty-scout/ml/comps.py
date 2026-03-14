import pandas as pd
import numpy as np
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler
import joblib
import logging

logger = logging.getLogger("CompGenerator")

class CompGenerator:
    """
    Finds historical comps for current prospects using K-Nearest Neighbors.
    """
    
    def __init__(self):
        # In real app, load historical database
        # Here we mock reference data
        self.history_data = pd.DataFrame({
            'name': ['Player A', 'Player B', 'Player C', 'Player D'],
            'height': [72, 74, 70, 75],
            'weight': [200, 220, 190, 230],
            'speed_score': [100, 105, 95, 110],
            'college_dominator': [0.3, 0.4, 0.25, 0.5]
        })
        
        self.features = ['height', 'weight', 'speed_score', 'college_dominator']
        self.scaler = StandardScaler()
        self.db_scaled = self.scaler.fit_transform(self.history_data[self.features])
        
        self.knn = NearestNeighbors(n_neighbors=3, algorithm='ball_tree')
        self.knn.fit(self.db_scaled)

    def find_comps(self, prospect):
        """
        prospect: dict of features
        """
        input_df = pd.DataFrame([prospect])
        input_scaled = self.scaler.transform(input_df[self.features])
        
        distances, indices = self.knn.kneighbors(input_scaled)
        
        comps = []
        for i, idx in enumerate(indices[0]):
            comp_name = self.history_data.iloc[idx]['name']
            similarity = 1 / (1 + distances[0][i]) # Simple conversion distance -> similarity
            comps.append((comp_name, similarity))
            
        return comps

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    gen = CompGenerator()
    
    # Test
    test_prospect = {'height': 73, 'weight': 210, 'speed_score': 102, 'college_dominator': 0.35}
    comps = gen.find_comps(test_prospect)
    logger.info(f"Comps for test prospect: {comps}")
