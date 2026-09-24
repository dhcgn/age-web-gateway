package glossary

// Refresh the generated glossary from jl: source comments and the topic
// chapters (requires no tools beyond the Go toolchain):
//
//go:generate go run ./gen -topics ../../docs/GLOSSARY.topics.yaml -out ../../docs/GLOSSARY.md -root ../..
