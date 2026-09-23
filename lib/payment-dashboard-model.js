function mergeFeedEntries(existingFeed, incomingEntries, limit = 8) {
  const merged = [...incomingEntries, ...existingFeed];
  const unique = merged.filter(
    (entry, index, items) =>
      items.findIndex((other) => other.id === entry.id) === index,
  );

  return unique.slice(0, limit);
}

function buildPaymentFeed(existingFeed, pipelineResult, limit = 8) {
  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return mergeFeedEntries(
    existingFeed,
    [
      {
        id: pipelineResult.receiptId,
        kind: "payment",
        message: `Sent ${pipelineResult.amount} XLM to ${pipelineResult.destination}`,
        detail: pipelineResult.statusSummary,
        time,
      },
      ...pipelineResult.events,
    ],
    limit,
  );
}

function getConsoleStatusLabel(status) {
  switch (status) {
    case "sending":
      return "Processing";
    case "success":
      return "Ready";
    case "error":
      return "Attention needed";
    default:
      return "Idle";
  }
}

function getStreamStatusLabel(isStreamAvailable, streamState) {
  if (!isStreamAvailable) {
    return "Live stream unavailable in this browser";
  }

  return streamState;
}

module.exports = {
  mergeFeedEntries,
  buildPaymentFeed,
  getConsoleStatusLabel,
  getStreamStatusLabel,
};
