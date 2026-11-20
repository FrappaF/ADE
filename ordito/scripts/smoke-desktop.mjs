import { copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

import path from 'node:path';

import { createSmokeHarness } from './smoke/harness.ts';
import { createCanvasScenarios } from './smoke/canvas.ts';
import { createImportScenarios } from './smoke/import.ts';
import { createAiScenarios } from './smoke/ai.ts';
import { createProjectsScenarios } from './smoke/projects.ts';
import { createBehaviorScenarios } from './smoke/behavior.ts';
import { createNavigationScenarios } from './smoke/navigation.ts';
import { createAccessibilityScenarios } from './smoke/accessibility.ts';
import { createBasicScenarios } from './smoke/basic.ts';

const harness = await createSmokeHarness();
const { notationsOnly, generatedOnly, followupOnly, canvasOnly, connectionPreviewOnly, semanticOnly, aiOnly, codeOnly, projectsOnly, impactOnly, stateOnly, sequenceOnly, navigationOnly, uxOnly, evidence, modelFile, emptyFile, invalidFile, workspace, args, root, executablePath, launchEnv } = harness;
const { checkConnectionPreview, checkInfiniteCanvas, checkNotations, checkSemanticTodo, checkGeneratedDiagrams, checkCodeBridge, checkAiWorkflow, checkIndependentProjects, checkModelImpact, checkStateDiagram, checkSequenceDiagram, checkSemanticNavigation, checkVisualUX, checkManualFollowup, checkBasicWorkflow } = { ...createCanvasScenarios(harness), ...createImportScenarios(harness), ...createAiScenarios(harness), ...createProjectsScenarios(harness), ...createBehaviorScenarios(harness), ...createNavigationScenarios(harness), ...createAccessibilityScenarios(harness), ...createBasicScenarios(harness) };

try {
	if (notationsOnly) { await checkNotations(); } else if (generatedOnly) { await checkGeneratedDiagrams(); }
	if (followupOnly) { await checkManualFollowup(); }
	if (connectionPreviewOnly) { await checkConnectionPreview(); } else if (canvasOnly) { await checkInfiniteCanvas(); }
	if (semanticOnly) { await checkSemanticTodo(); }
	if (aiOnly) { await checkAiWorkflow(); }
	if (codeOnly) { await checkCodeBridge(); }
	if (projectsOnly) { await checkIndependentProjects(); }
	if (impactOnly) { await checkModelImpact(); }
	if (stateOnly) { await checkStateDiagram(); }
	if (sequenceOnly) { await checkSequenceDiagram(); }
	if (navigationOnly) { await checkSemanticNavigation(); }
	if (uxOnly) { await checkVisualUX(); }
	if (!process.argv.includes('--extension-only') && !uxOnly && !navigationOnly && !sequenceOnly && !stateOnly && !impactOnly && !projectsOnly && !codeOnly && !aiOnly && !followupOnly && !canvasOnly && !semanticOnly && !generatedOnly && !notationsOnly) { await checkBasicWorkflow(); }
	if (process.argv.includes('--native-only') || uxOnly || navigationOnly || sequenceOnly || stateOnly || impactOnly || projectsOnly || codeOnly || aiOnly || followupOnly || canvasOnly || semanticOnly || generatedOnly || notationsOnly) {
		console.log('PASS: native-only smoke completed without an Extension Development Host.');
	} else {
		await copyFile(path.join(root, 'ordito/prototype/examples/checkout.diagram.json'), path.join(workspace, 'checkout.diagram.json'));
		await new Promise((resolve, reject) => {
			const child = spawn(executablePath, [...args, '--skip-welcome',
				`--extensionDevelopmentPath=${root}/ordito/prototype`, `--extensionTestsPath=${root}/ordito/prototype/host-test/index.cjs`],
			{ cwd: root, env: launchEnv, stdio: 'inherit' });
			const timer = setTimeout(() => { child.kill(); reject(new Error('Extension Host smoke timed out')); }, 120000);
			child.on('error', error => { clearTimeout(timer); reject(error); });
			child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Extension Host exited with ${code}`)); });
		});
	}
}
catch (error) { await harness.reportFailure(error); }
finally { await harness.dispose(); }
