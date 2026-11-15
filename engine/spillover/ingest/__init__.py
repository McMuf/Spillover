"""Data ingestion: turn provider data into the cache format the engine reads.

The cache has the same layout as the synthetic fixtures (``prices.parquet`` of daily returns,
``events.parquet``, ``MANIFEST.json``), so every command works on real data by pointing
``--data`` at it. Only derived returns are written, never vendor price files, and the cache lives
outside version control by default.
"""
