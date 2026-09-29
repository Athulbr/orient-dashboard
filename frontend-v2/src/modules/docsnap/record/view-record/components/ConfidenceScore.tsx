export const ConfidenceScore = ({ confidence = '' }: { confidence: string }) => {
    const score = Number(confidence);
    if (Number.isNaN(score)) return null;
    if (score < 10) return null;
    return (
        <span className={`pr-1 font-mono text-xs ${score > 90 ? 'text-green-600' : score > 80 ? 'text-orange-400' : 'text-red-600'}`}>{score.toFixed(0)}%</span>
    );
};
