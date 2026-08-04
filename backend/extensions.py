"""Flask extension instances shared by the application and models."""

from flask_sqlalchemy import SQLAlchemy

# Kept outside app.py to avoid importing the application module from models.
db = SQLAlchemy()
