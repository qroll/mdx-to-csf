import glob from "fast-glob";
import fs from "fs";
import _ from "lodash";
import { Root } from "mdast";
import path from "path";
import mdx from "remark-mdx";
import markdown from "remark-parse";
import { unified } from "unified";
import { convert } from "unist-util-is";
import { visit } from "unist-util-visit";
import stringify from "remark-stringify";

const processor = unified().use(markdown).use(mdx).use(stringify);

const pascal = (str) => _.upperFirst(_.camelCase(str));

async function convertMdx1ToCsf(filePath: string) {
  const file = fs.readFileSync(filePath);
  const fileStr = file.toString("utf-8");
  const fileLines = file.toString("utf-8").split("\n");
  const tree = processor.parse(file);
  const initialFileName = path.basename(filePath, ".mdx");
  const filename = initialFileName.endsWith(".stories") ? initialFileName.slice(0, -8) : initialFileName;
  // some files start with numbering
  const filename2 = filename.replace(/\d/g, "");
  const storyImport = pascal(filename2) + "Stories";

  let storyFile = "";
  let csfFile = "";
  let componentName = "";

  // console.log("================= tree");
  // console.log(tree);

  const importsToBringOver: string[] = [];

  visit(tree, "mdxjsEsm", function (node, index, parent) {
    node.data?.estree?.body.forEach((decl) => {
      if (decl.type === "ImportDeclaration") {
        if (
          decl.source.value !== "react" &&
          decl.source.value !== "@storybook/addon-docs" &&
          !(decl.source.value as unknown as string).includes("storybook-common")
        ) {
          const specifiers = decl.specifiers
            .map((s) => (s as any).imported?.name)
            .filter((s) => !!s)
            .join(", ");
          importsToBringOver.push(
            `import { ${specifiers} } from "${decl.source.value}";`
          );
        }
      }
    });

    storyFile += `import { Canvas, Meta } from "@storybook/blocks";
import { Heading3, Heading4, Secondary, Title } from "../storybook-common";
import * as ${storyImport} from "./${filename}.stories";
import { PropsTable } from "./props-table";
`;
  });

  visit<Root, "mdxJsxFlowElement">(
    tree,
    { type: "mdxJsxFlowElement", name: "Meta" } as any,
    function (node, index, parent) {
      const title = node.attributes.find((a) => (a as any).name === "title");
      const component = node.attributes.find(
        (a) => (a as any).name === "component"
      );

      const metaTitle = title?.value;
      componentName = (component?.value as any)?.value;

      storyFile += `
<Meta of={${storyImport}} />

`;

      csfFile += `
import type { Meta, StoryObj } from "@storybook/react";
${importsToBringOver.join("\n")}

type Component = typeof ${componentName};

const meta: Meta<Component> = {
    title: "${metaTitle}",
    component: ${componentName},
};

export default meta;
        `;
    }
  );

  const parsedMarkdown = processor.stringify({
    type: "root",
    children: tree.children.reduce((children, child) => {
      const isImport = child.type === "mdxjsEsm";
      const isMeta =
        child.type === "mdxJsxFlowElement" && child.name === "Meta";

      if (isImport || isMeta) {
        return children;
      }

      const isCanvas =
        child.type === "mdxJsxFlowElement" && child.name === "Canvas";

      if (isCanvas) {
        const story = child.children.find((c) => c.name === "Story");
        if (!story) {
          // weird but ok
          return children;
        }

        const storyName = story.attributes.find((a) => a.name === "name");
        const csfName = pascal(storyName.value);
        const exportName = csfName === componentName ? "Default" : csfName;
        child.attributes = [
          {
            type: "mdxJsxAttribute",
            name: "of",
            value: {
              type: "mdxJsxAttributeValueExpression",
              value: `${storyImport}.${exportName}`,
            },
          },
        ];
        child.children = [];

        const jsx = story.children[0];

        if (jsx.type === "mdxJsxFlowElement") {
          const start = jsx.position!.start.offset;
          const end = jsx.position!.end.offset;

          const lines = _.range(start, end + 1)
            .map((i) => fileStr[i])
            .join("");

          csfFile += `
    export const ${exportName}: StoryObj<Component> = {
      render: () => {
          return ${lines};
      },
    };
              `;
        } else if (jsx.type === "mdxFlowExpression") {
          const expr = jsx.data.estree.body[0].expression;
          const lines = _.range(expr.start, expr.end)
            .map((i) => fileStr[i])
            .join("");

          csfFile += `
    export const ${exportName}: StoryObj<Component> = {
      render: ${lines}
    };
              `;
        }
      }

      return [...children, child];
    }, []),
  });

  // console.log("================= story");
  // console.log(storyFile);
  // console.log(parsedMarkdown);
  // console.log("================= csf");
  // console.log(csfFile);

  fs.writeFileSync(
    path.resolve(path.dirname(filePath), filename + ".mdx"),
    storyFile + "\n" + parsedMarkdown
  );

  fs.writeFileSync(
    path.resolve(path.dirname(filePath), filename + ".stories.tsx"),
    csfFile
  );
}

async function program() {
  const paths = await glob([
    "/Users/roll/lifesg/react-design-system-sb7/stories/**/*.stories.mdx",
  ]);

  for (const filePath of paths) {
    console.log("Converting", filePath);

    try {
      await convertMdx1ToCsf(filePath);
    } catch (err) {
      console.log("Error with", filePath, err);
    }
  }
}

program();
