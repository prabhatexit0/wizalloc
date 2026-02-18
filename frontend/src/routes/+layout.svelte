<script lang="ts">
	let { children } = $props();
</script>

<svelte:head>
	<title>wizalloc</title>
	<meta name="description" content="Interactive data structure visualizer powered by Rust/WASM" />
</svelte:head>

<div class="app">
	<header>
		<div class="header-left">
			<span class="brand">wizalloc</span>
		</div>
		<nav>
			<a href="/" class="nav-item active">Linked List</a>
			<span class="nav-item disabled">SkipList</span>
			<span class="nav-item disabled">B-Tree</span>
			<span class="nav-item disabled">LSM Tree</span>
		</nav>
	</header>

	<main>
		{@render children()}
	</main>

	<footer>
		<span>Rust/WASM</span>
		<span>Svelte 5</span>
	</footer>
</div>

<style>
	:global(*, *::before, *::after) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}
	:global(body) {
		background: #1e1e1e;
		color: rgba(255, 255, 255, 0.87);
		font-family: Inter, system-ui, -apple-system, sans-serif;
		font-synthesis: none;
		text-rendering: optimizeLegibility;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		overflow: hidden;
	}
	.app {
		height: 100vh;
		height: 100dvh;
		width: 100vw;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 36px;
		padding: 0 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		flex-shrink: 0;
	}
	.header-left {
		display: flex;
		align-items: center;
	}
	.brand {
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 13px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
		letter-spacing: -0.3px;
	}
	nav {
		display: flex;
		gap: 2px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 9999px;
		padding: 2px;
	}
	.nav-item {
		padding: 2px 10px;
		border-radius: 9999px;
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 11px;
		text-decoration: none;
		color: rgba(255, 255, 255, 0.4);
		transition: all 0.15s;
		cursor: pointer;
		user-select: none;
	}
	.nav-item.active {
		color: #fff;
		background: #007acc;
		box-shadow: 0 0 8px rgba(59, 130, 246, 0.3);
	}
	.nav-item.disabled {
		opacity: 0.3;
		cursor: default;
	}
	a.nav-item:hover:not(.active) {
		color: rgba(255, 255, 255, 0.6);
		background: rgba(255, 255, 255, 0.06);
	}
	main {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	footer {
		height: 22px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 16px;
		background: #007acc;
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 11px;
		color: #fff;
		flex-shrink: 0;
	}
</style>
