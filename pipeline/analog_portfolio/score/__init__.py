"""Reference scorer. The JS Web Worker port must match these on contract/test_vectors.json."""
from .normalize import (  # noqa: F401
    bounded_fraction,
    capped_directional,
    flag_match,
    gaussian,
    geometric_mean,
    ordinal_class,
    ratio_sim,
    total_score,
)
