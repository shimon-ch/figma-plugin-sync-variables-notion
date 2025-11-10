import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { viteSingleFile } from 'vite-plugin-singlefile';

const isPluginBuild = process.env.BUILD_TARGET === 'plugin';

export default defineConfig(({ mode }) => {
  // プラグインコード用の設定
  if (isPluginBuild) {
    return {
      build: {
        lib: {
          entry: resolve(__dirname, 'src/plugin/controller.ts'),
          name: 'FigmaPlugin',
          fileName: 'code',
          formats: ['iife']
        },
        outDir: 'dist',
        emptyOutDir: false,
        rollupOptions: {
          external: ['figma'],
          output: {
            globals: { figma: 'figma' }
          }
        },
        target: 'es2017',
        minify: mode === 'production'
      },
      resolve: {
        alias: {
          '@': resolve(__dirname, './src'),
          '@/components': resolve(__dirname, './src/components'),
          '@/lib': resolve(__dirname, './src/lib'),
          '@/hooks': resolve(__dirname, './src/hooks')
        }
      }
    };
  }
  
  // UI用の設定
  return {
    plugins: [
      tailwindcss(),
      react(),
      viteSingleFile({
        removeViteModuleLoader: true,
        useRecommendedBuildConfig: true
      })
    ],
    root: 'src/ui',
    base: './',
    build: {
      outDir: '../../dist',
      emptyOutDir: false,
      rollupOptions: {
        input: resolve(__dirname, 'src/ui/ui.html'),
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]'
        }
      },
      target: 'es2017',
      minify: mode === 'production'
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        '@/components': resolve(__dirname, './src/components'),
        '@/lib': resolve(__dirname, './src/lib'),
        '@/hooks': resolve(__dirname, './src/hooks')
      }
    }
  };
});
