# Agent shells only: unmatched globs pass through literally, like bash (`echo 100*141/118`).
[[ -n $CLAUDECODE ]] && setopt nonomatch
